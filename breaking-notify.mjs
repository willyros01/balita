/* ============================================================
   breaking-notify.mjs — tightly limited breaking-news sender.

   It never decides that ordinary news is breaking. A publisher must
   put an approved marker at the beginning of its own headline.
   ============================================================ */

import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";

const PROJECT_ID = "wire-news-6da5a";
const ARTICLES_FILE = "articles.json";
const STATE_FILE = "breaking-state.json";

const APPROVED_SOURCES = new Set([
  "inq", "inqn", "inqg", "cbc", "bbc", "gma", "dw", "abs"
]);
const INQUIRER_SOURCES = new Set(["inq", "inqn", "inqg"]);
const MARKER = /^\s*(?:\[(?:breaking|just\s+in|urgent|live)\]|(?:breaking|just\s+in|urgent|live)\s*[:\u2014\u2013-])\s*/i;

/* A generous backstop, not a throttle. The marker above is the real
   gate — a publisher must explicitly tag its own headline as
   breaking, urgent, live, or just in, across only eight approved
   sources, so genuinely qualifying stories are already rare. This
   exists only to catch a true runaway (a feed glitch re-marking many
   old headlines at once), not to hold back real, distinct breaking
   stories that legitimately arrive close together.

   The previous version also refused to send more than one alert in
   any thirty-minute window, regardless of how many stories qualified,
   which was reasonable when the client could only ever track one
   pending notification at a time. The client now keeps a proper
   queue, keyed by each story's own id, so several genuine alerts can
   wait their turn without one erasing another. That rule is gone. */
const MAX_PER_RUN = 10;
const MAX_SENT_LOG = 500;
const MAX_SEEN_IDS = 2000;

export function qualifies(article){
  return article && APPROVED_SOURCES.has(article.source) &&
    typeof article.title === "string" && MARKER.test(article.title);
}

async function loadState(){
  if(!existsSync(STATE_FILE)) return null;
  try{
    const state = JSON.parse(await readFile(STATE_FILE, "utf8"));
    if(state && state.version === 1 && Array.isArray(state.seenIds) && Array.isArray(state.sent)){
      return state;
    }
  }catch(err){ /* A malformed state must stop rather than risk a flood. */ }
  throw new Error("breaking-state.json is invalid; refusing to send notifications.");
}

async function saveState(state){
  await writeFile(STATE_FILE, JSON.stringify(state, null, 2) + "\n");
}

function field(doc, name, kind){
  return doc?.fields?.[name]?.[kind];
}

async function api(url, accessToken, options = {}){
  return fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
}

async function subscriptions(accessToken){
  const found = [];
  let pageToken = "";
  do{
    const query = new URLSearchParams({ pageSize: "300" });
    if(pageToken) query.set("pageToken", pageToken);
    const res = await api(
      `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/pushSubscriptions?${query}`,
      accessToken
    );
    if(!res.ok) throw new Error(`Could not read notification subscriptions (HTTP ${res.status}).`);
    const body = await res.json();
    for(const doc of body.documents || []){
      const token = field(doc, "token", "stringValue");
      const enabled = field(doc, "enabled", "booleanValue");
      if(token && enabled !== false) found.push({ name: doc.name, token });
    }
    pageToken = body.nextPageToken || "";
  }while(pageToken);
  return found;
}

function unregistered(status, body){
  if(status === 404) return true;
  return (body?.error?.details || []).some(detail =>
    detail?.errorCode === "UNREGISTERED"
  );
}

async function removeSubscription(accessToken, name){
  const res = await api(`https://firestore.googleapis.com/v1/${name}`, accessToken, {
    method: "DELETE"
  });
  if(!res.ok && res.status !== 404){
    console.warn(`Could not remove an expired subscription (HTTP ${res.status}).`);
  }
}

async function sendOne(accessToken, subscription, article, sourceName){
  const sentAt = new Date().toISOString();
  const message = {
    message: {
      token: subscription.token,
      data: {
        articleId: String(article.id),
        sourceName: String(sourceName || article.source).slice(0, 40),
        title: String(article.title).slice(0, 220),
        sentAt
      },
      webpush: {
        headers: {
          TTL: "1800",
          Urgency: "normal"
        }
      }
    }
  };

  let res;
  try{
    res = await api(
      `https://fcm.googleapis.com/v1/projects/${PROJECT_ID}/messages:send`,
      accessToken,
      { method: "POST", body: JSON.stringify(message) }
    );
  }catch(err){
    console.warn("One notification delivery failed because FCM was unreachable.");
    return false;
  }
  if(res.ok) return true;

  let body = {};
  try{ body = await res.json(); }catch(err){ /* status still identifies the failure */ }
  if(unregistered(res.status, body)) await removeSubscription(accessToken, subscription.name);
  console.warn(`One notification delivery failed (HTTP ${res.status}).`);
  return false;
}

async function main(){
  const feed = JSON.parse(await readFile(ARTICLES_FILE, "utf8"));
  const articles = Array.isArray(feed.articles) ? feed.articles : [];
  const strictCandidates = articles.filter(qualifies)
    .sort((a, b) => new Date(b.published || 0) - new Date(a.published || 0));

  let state = await loadState();
  if(!state || process.argv.includes("--bootstrap")){
    state = {
      version: 1,
      initializedAt: new Date().toISOString(),
      seenIds: strictCandidates.map(a => a.id).filter(Boolean).slice(0, MAX_SEEN_IDS),
      sent: []
    };
    await saveState(state);
    console.log(`Breaking-news baseline saved (${state.seenIds.length} marked stories, no alerts sent).`);
    return;
  }

  const seen = new Set(state.seenIds);
  const testInquirer = process.env.WIRE_TEST_INQUIRER === "1";
  const candidates = testInquirer
    ? articles
      .filter(a => a?.id && INQUIRER_SOURCES.has(a.source) && !seen.has(a.id))
      .sort((a, b) => new Date(b.published || 0) - new Date(a.published || 0))
      .slice(0, 1)
    : strictCandidates;
  const newCandidates = candidates.filter(a => a.id && !seen.has(a.id));

  /* Every candidate is marked seen now, even when the backstop above
     suppresses it. This intentionally drops any true excess instead
     of building a backlog that would otherwise dump all at once on a
     later run. */
  for(const article of newCandidates) seen.add(article.id);
  state.seenIds = [...seen].slice(-MAX_SEEN_IDS);

  const selected = newCandidates.slice(0, MAX_PER_RUN);

  if(!selected.length){
    await saveState(state);
    console.log(newCandidates.length
      ? `Suppressed ${newCandidates.length} marked story or stories over the per-run backstop.`
      : testInquirer
        ? "No unseen Inquirer story is available for the manual test."
        : "No new strictly marked breaking stories.");
    return;
  }

  const accessToken = process.env.GOOGLE_ACCESS_TOKEN;
  if(!accessToken) throw new Error("GOOGLE_ACCESS_TOKEN is missing; refusing to send.");

  const devices = await subscriptions(accessToken);
  const sourceNames = new Map((feed.sources || []).map(s => [s.id, s.name]));

  if(!devices.length){
    await saveState(state);
    console.log(testInquirer
      ? "An Inquirer test story was found, but no devices are subscribed. No alert sent."
      : "A marked story was found, but no devices are subscribed. No alert sent.");
    return;
  }

  for(const article of selected){
    const notificationArticle = testInquirer
      ? { ...article, title: `[Test] ${article.title}` }
      : article;
    const results = await Promise.all(
      devices.map(device => sendOne(accessToken, device, notificationArticle, sourceNames.get(article.source)))
    );
    const delivered = results.filter(Boolean).length;
    if(delivered){
      state.sent.push({ id: article.id, source: article.source, sentAt: new Date().toISOString() });
      console.log(testInquirer
        ? `Sent one Inquirer test alert to ${delivered} device or devices.`
        : `Sent one strictly marked alert to ${delivered} device or devices.`);
    }else{
      console.warn("The marked alert could not be delivered to any subscribed device.");
    }
  }

  /* No longer read for anything, since sending is no longer gated by
     how recently something last went out. Kept only as a bounded,
     human-readable log of what has actually been sent. */
  state.sent = state.sent.slice(-MAX_SENT_LOG);

  await saveState(state);
}

if(process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href){
  main().catch(err => {
    console.error("Breaking-news notification step failed:", err.message || err);
    process.exit(1);
  });
}
