/* ============================================================
   app.js — the wiring. Loads settings and sources, fetches the
   stories, hands a small shared context to each module.

   Nothing in here draws anything itself.
   ============================================================ */

import { FEED_URL, VERSION, BUILD_DATE } from "./config.js";
import { toast, onTap } from "./ui.js";
import * as store   from "./store.js";
import * as display from "./display.js";
import * as feed    from "./feed.js";
import * as reader  from "./reader.js";
import * as sources from "./sources.js";
import * as notifications from "./notifications.js";

const state = {
  sources:     [],
  standard:    [],   /* the list the fetcher works from */
  articles:    [],
  filter:      "ALL",
  updated:     null,   /* when the fetcher last ran */
  feedVersion: null,   /* which fetcher wrote it */
  synced:      false   /* Firebase configured and reachable */
};

/* Every message the app has ever produced went into a hidden
   element for screen readers and was never shown to anybody else.
   It goes on screen now, and still reaches screen readers. */
function announce(msg, kind, action){
  toast(msg, kind || "done", action);
}

const ctx = {
  state,
  version: VERSION,
  announce,
  /* Match on id, then on address. A source saved under a generated
     id would otherwise never be recognised as the outlet its stories
     belong to, and every one of them would silently vanish. */
  sourceOf: id => state.sources.find(s => s.id === id),
  show: view => { document.body.dataset.view = view; },
  refresh: () => { feed.renderChips(ctx); feed.renderFeed(ctx); renderAbout(); },
  openArticle: id => reader.open(ctx, id),
  openSources: () => sources.show(ctx)
};

/* ---------------- stories ---------------- */

/* Reload the stories from the server.

   There was no way to do this short of quitting the app and opening
   it again: the file is fetched once at startup and never again, so
   a run that finished five minutes ago was invisible until the app
   was killed. */
export async function refresh(){
  const btn = document.getElementById("refresh");
  if(btn){
    btn.disabled = true;
    btn.classList.add("spinning");
  }

  const before = state.articles.length;
  await loadArticles();

  state.sources = await store.loadSources();
  ctx.refresh();
  renderAbout();

  if(btn){
    btn.disabled = false;
    btn.classList.remove("spinning");
  }

  const gained = state.articles.length - before;
  announce(
    !state.articles.length ? "Could not reach the stories. Check your connection." :
    gained > 0  ? gained + (gained === 1 ? " new story" : " new stories") :
    gained < 0  ? "Updated \u2014 " + state.articles.length + " stories" :
                  "Already up to date",
    !state.articles.length ? "warn" : gained > 0 ? "undone" : "done"
  );
}

async function loadArticles(cacheBust = false){
  try{
    const feedUrl = cacheBust
      ? FEED_URL + (FEED_URL.includes("?") ? "&" : "?") + "notification=" + Date.now()
      : FEED_URL;
    const res = await fetch(feedUrl, { cache: "no-store" });
    if(!res.ok) throw new Error("HTTP " + res.status);

    const data = await res.json();
    state.articles    = Array.isArray(data.articles) ? data.articles : [];
    state.updated     = data.updated || null;
    state.feedVersion = data.version || null;
  }catch(err){
    console.warn("Could not load stories.", err);
    state.articles    = [];
    state.updated     = null;
    state.feedVersion = null;
  }
}

/* ---------------- keyboard ---------------- */

document.addEventListener("keydown", e => {
  if(e.key !== "Escape") return;
  if(document.body.dataset.view === "feed") return;

  if(document.body.dataset.view === "reader"){
    reader.close(ctx);   /* returns to where the story was opened from */
    return;
  }

  ctx.show("feed");
  ctx.refresh();
  window.scrollTo(0, 0);
});

/* ---------------- offline ---------------- */

function registerWorker(){
  if(!("serviceWorker" in navigator)) return;
  if(location.protocol === "file:") return;   /* only works over http */

  const install = () => {
    navigator.serviceWorker.register("sw.js", { updateViaCache: "none" }).then(registration => {
      /* A Home Screen app may remain alive for days. Check now so a routing
         correction does not wait for the browser's periodic update cycle. */
      void registration.update();
    }).catch(err => {
      console.warn("Offline support unavailable.", err);
    });
  };

  if(document.readyState === "complete") install();
  else window.addEventListener("load", install, { once: true });
}

/* ---------------- durable storage: IndexedDB ----------------
   Matches sw.js exactly. See there for why this replaced Cache
   Storage. */
const DB_NAME = "wire-durable";
const DB_VERSION = 3;   /* bumped again to add the trace store below */
const ROUTE_STORE = "route";
const LAST_TAP_STORE = "lastTap";
const LAST_TAP_KEY = "current";
const TRACE_STORE = "trace";

function openDB(){
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if(!db.objectStoreNames.contains(ROUTE_STORE)) db.createObjectStore(ROUTE_STORE);
      if(!db.objectStoreNames.contains(LAST_TAP_STORE)) db.createObjectStore(LAST_TAP_STORE);
      if(!db.objectStoreNames.contains(TRACE_STORE)) db.createObjectStore(TRACE_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbDelete(store, key){
  /* One retry, on any failure — matches sw.js exactly. Cheap, and
     catches the narrow window right after a fresh install where the
     database might still be finishing its own creation. */
  for(const attempt of [0, 1]){
    try{
      const db = await openDB();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(store, "readwrite");
        tx.objectStore(store).delete(key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      return;
    }catch(err){
      if(attempt === 1) throw err;
      await new Promise(r => setTimeout(r, 150));
    }
  }
}

async function idbGetAll(store){
  for(const attempt of [0, 1]){
    try{
      const db = await openDB();
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(store, "readonly");
        const keysReq = tx.objectStore(store).getAllKeys();
        const valsReq = tx.objectStore(store).getAll();
        tx.oncomplete = () => resolve((keysReq.result || []).map((key, i) => ({ key, value: valsReq.result[i] })));
        tx.onerror = () => reject(tx.error);
      });
    }catch(err){
      if(attempt === 1) throw err;
      await new Promise(r => setTimeout(r, 150));
    }
  }
}

/* ---------------- trace ----------------
   Small and specific, not the full recording built during the earlier
   investigation — just enough to see, in plain sentences, exactly
   what the page finds when it checks, and whether the app was already
   open beforehand or not. Each entry writes to its own key, which is
   what makes it safe against several events firing close together.
   Offered as a downloadable text file rather than a panel to
   screenshot — a screenshot has cut off lines and mangled exact text
   more than once in this project; a file cannot. Remove once this
   question is answered. */
async function trace(sentence){
  try{
    const stamp = Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
    const t = new Date().toISOString().slice(11, 23);
    await idbPut(TRACE_STORE, stamp, { t, who: "the page", sentence });
  }catch(err){ /* Never let recording break the thing being recorded. */ }
}

async function idbPut(store, key, value){
  for(const attempt of [0, 1]){
    try{
      const db = await openDB();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(store, "readwrite");
        tx.objectStore(store).put(value, key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      return;
    }catch(err){
      if(attempt === 1) throw err;
      await new Promise(r => setTimeout(r, 150));
    }
  }
}

async function readTrace(){
  try{
    const rows = await idbGetAll(TRACE_STORE);
    return rows
      .map(r => r.value)
      .filter(v => v?.t)
      .sort((a, b) => a.t.localeCompare(b.t))
      .map(v => v.t + "  \u2014  " + v.who + "  \u2014  " + v.sentence);
  }catch(err){ return []; }
}

async function clearTrace(){
  try{
    const db = await openDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(TRACE_STORE, "readwrite");
      tx.objectStore(TRACE_STORE).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }catch(err){ /* nothing to clear */ }
}

function downloadTrace(lines){
  const blob = new Blob([lines.length ? lines.join("\n") + "\n" : "Nothing recorded yet.\n"],
    { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "wire-trace.txt";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/* ---------------- breaking-news notifications ----------------

   A durable queue rather than one overwritable slot, since the sender
   no longer holds back a second alert for half an hour — several
   genuinely breaking stories can now arrive before any of them are
   opened, and none of them should be lost or silently replaced by a
   later one.

   Separately from that queue, the worker also records exactly which
   banner a tap pressed — the one piece of information a tap gives
   with total certainty. That specific article always takes priority
   over the general queue, so tapping one particular notification
   reliably opens that one, rather than whichever happens to be
   oldest. The general queue is only for when there is no such
   certainty at all: the app opened from its icon, or switched back to
   without pressing any specific banner. In that situation the oldest
   waiting story is the best available guess, and only one is opened
   per check, leaving the rest for the next one.

   Woken only by the app becoming visible — never by the tap directly,
   never by a timer. */
let notificationCheckRunning = false;
let lastOpenedNotificationArticle = "";
const NOTIFICATION_ROUTE_MAX_AGE_MS = 30 * 60 * 1000;

async function readLastTap(){
  try{
    const rows = await idbGetAll(LAST_TAP_STORE);
    const row = rows.find(r => r.key === LAST_TAP_KEY);
    const articleId = String(row?.value?.articleId || "");
    const sentAt = String(row?.value?.sentAt || "");
    if(articleId) return { articleId, sentAt };
  }catch(err){ /* nothing to read */ }
  return null;
}

async function clearLastTap(){
  try{ await idbDelete(LAST_TAP_STORE, LAST_TAP_KEY); }
  catch(err){ /* nothing to clear */ }
}

async function readNextNotificationRoute(){
  try{
    const rows = await idbGetAll(ROUTE_STORE);
    const routes = rows
      .map(r => ({ articleId: String(r.value?.articleId || ""), sentAt: String(r.value?.sentAt || "") }))
      .filter(r => r.articleId);
    if(!routes.length) return null;
    routes.sort((a, b) => a.sentAt.localeCompare(b.sentAt));
    return routes[0];
  }catch(err){ return null; }
}

async function clearNotificationRoute(route){
  try{ await idbDelete(ROUTE_STORE, route.articleId); }
  catch(err){ /* nothing to clear */ }
}

async function loadNotificationArticle(articleId){
  if(!/^[a-z0-9-]+$/i.test(articleId)) return null;

  try{
    const url = "articles/" + encodeURIComponent(articleId) +
      ".json?notification=" + Date.now();
    const response = await fetch(url, { cache: "no-store" });
    if(!response.ok) return null;

    const article = await response.json();
    if(String(article.id || "") !== articleId) return null;
    const at = state.articles.findIndex(item => item.id === articleId);
    if(at >= 0) state.articles[at] = article;
    else state.articles.push(article);
    return article;
  }catch(err){
    console.warn("Could not load the notified story directly.", err);
    return null;
  }
}

function prepareNotificationReturn(article){
  state.filter = article.source;
  ctx.show("feed");
  ctx.refresh();

  const card = Array.from(document.querySelectorAll("[data-article-id]"))
    .find(node => node.dataset.articleId === article.id);
  if(card) window.scrollTo(0, Math.max(0, card.offsetTop - 16));
}

/* Shared by both the specific-tap path and the general queue: given
   one route, either opens it and returns true, or explains why it
   could not and returns false. Never touches storage itself — the
   caller decides what to clear, since the two paths clear from
   different places. */
async function resolveAndOpenRoute(route){
  if(route.articleId === lastOpenedNotificationArticle) return false;

  const sentAtMs = Date.parse(route.sentAt || "");
  if(Number.isFinite(sentAtMs) && Date.now() - sentAtMs > NOTIFICATION_ROUTE_MAX_AGE_MS){
    announce("This notification expired before it was opened. Showing current headlines.", "warn");
    return false;
  }

  if(!state.articles.some(article => article.id === route.articleId)){
    await loadNotificationArticle(route.articleId);
  }
  if(!state.articles.some(article => article.id === route.articleId)){
    await loadArticles(true);
    ctx.refresh();
  }

  const article = state.articles.find(item => item.id === route.articleId);
  if(!article){
    /* The story this notification pointed to is genuinely gone —
       removed or replaced at the source, not merely still loading.
       Said plainly rather than silently landing on the main feed
       with no explanation at all. */
    announce("That story is no longer available. It may have been updated or replaced.", "warn");
    return false;
  }

  prepareNotificationReturn(article);
  ctx.openArticle(route.articleId);
  lastOpenedNotificationArticle = route.articleId;
  return true;
}

async function checkForNotifiedArticle(){
  if(notificationCheckRunning) return;
  if(document.visibilityState !== "visible") return;

  notificationCheckRunning = true;
  try{
    await trace("The app became visible and is now checking for a notification to open.");

    /* A specific tap, if there is one, is handled on its own and
       exclusively — it does not fall through to the general queue,
       whether it opens successfully or turns out to be gone. Opening
       some other story instead of the one actually pressed would be
       its own kind of wrong answer. */
    const tapped = await readLastTap();
    if(tapped){
      await trace("Found a specifically-tapped article recorded: \u201c" + tapped.articleId +
        "\u201d, sent at " + tapped.sentAt + ".");
      await clearLastTap();
      const opened = await resolveAndOpenRoute(tapped);
      await trace(opened
        ? "Opened article \u201c" + tapped.articleId + "\u201d successfully \u2014 this was the specifically-tapped one."
        : "Could not open the specifically-tapped article \u201c" + tapped.articleId + "\u201d (expired, already open, or no longer found).");
      await clearNotificationRoute(tapped);
      return;
    }

    await trace("No specifically-tapped article was recorded \u2014 falling back to the general list, oldest first.");

    /* No specific tap pending — the app was opened generally, so the
       oldest still-waiting story is the best available answer. Expired
       and no-longer-available entries are cleared in the same pass,
       so the queue never fills up with things that will never open —
       but only one story is actually opened per check. */
    while(true){
      const route = await readNextNotificationRoute();
      if(!route){ await trace("The general list is empty. Nothing to open."); return; }

      const opened = await resolveAndOpenRoute(route);
      await trace(opened
        ? "Opened article \u201c" + route.articleId + "\u201d from the general list."
        : "Article \u201c" + route.articleId + "\u201d from the general list could not be opened (expired, already open, or no longer found) \u2014 trying the next one.");
      await clearNotificationRoute(route);
      if(opened) return;
    }
  }catch(err){
    await trace("Something threw an error while checking \u2014 " + String(err?.message || err));
    console.warn("Could not check for a notified story.", err);
  }finally{
    notificationCheckRunning = false;
  }
}

/* One tap, one action — nothing more.

   pageshow, focus and visibilitychange can all fire within a few
   milliseconds of each other for a single moment of the app becoming
   visible; this project's own traces have shown that repeatedly. The
   busy-flag on checkForNotifiedArticle stops those from running at
   the same time as each other, but it does nothing to stop a second
   one from taking its own full turn immediately after the first
   finishes — and a second turn, with the tap's own signal already
   consumed by the first, falls back to the general queue and opens
   something else entirely. One tap could open two or three articles
   in a row, faster than any of them could actually be seen, and only
   the last one ever became visible.

   Coalescing every trigger within a short window into a single actual
   check closes that gap: however many of these fire for one real
   moment of becoming visible, only one check ever runs for it. A
   hundred milliseconds is far longer than these have ever been
   observed to spread apart, and far too short for a person to
   perceive as a delay. */
let notificationCheckScheduled = false;
function scheduleNotificationCheck(){
  if(notificationCheckScheduled) return;
  notificationCheckScheduled = true;
  setTimeout(() => {
    notificationCheckScheduled = false;
    checkForNotifiedArticle();
  }, 100);
}

window.addEventListener("pageshow", scheduleNotificationCheck);
window.addEventListener("focus", scheduleNotificationCheck);
document.addEventListener("visibilitychange", () => {
  if(document.visibilityState === "visible") scheduleNotificationCheck();
});

/* ---------------- is anything too wide? ----------------

   Four attempts have been made to stop the page overflowing
   sideways, each by reasoning about what might be doing it. This
   asks the browser instead: it walks the page, finds anything
   sticking out past the screen, and says what it is. Silent when
   everything fits. */
function measureWidth(){
  window.setTimeout(() => {
    const limit = document.documentElement.clientWidth;
    const guilty = [];

    document.querySelectorAll("body *").forEach(el => {
      const r = el.getBoundingClientRect();
      if(r.width === 0 && r.height === 0) return;
      const style = getComputedStyle(el);
      if(style.position === "fixed") return;   /* cannot widen the page */
      if(r.right > limit + 1 || r.left < -1){
        guilty.push({
          what: el.tagName.toLowerCase() +
                (el.className && typeof el.className === "string"
                  ? "." + el.className.split(/\s+/).filter(Boolean).slice(0, 2).join(".")
                  : ""),
          over: Math.round(Math.max(r.right - limit, -r.left))
        });
      }
    });

    if(!guilty.length) return;
    console.warn("Wider than the screen:", guilty);
  }, 600);
}

/* ---------------- about panel ----------------
   Answers "what is running on this phone, and when did it last
   fetch anything" without needing anybody's help. */

function longDate(iso){
  if(!iso) return null;
  const d = new Date(iso);
  if(Number.isNaN(d.getTime())) return null;
  return d.toLocaleString(undefined, {
    weekday: "short", day: "numeric", month: "short",
    hour: "numeric", minute: "2-digit"
  });
}

function pill(text, ok){
  const s = document.createElement("span");
  s.className = "pill " + (ok ? "pill-ok" : "pill-off");
  s.textContent = text;
  return s;
}

function renderAbout(){
  const list = document.getElementById("about-list");
  const note = document.getElementById("about-note");
  if(!list) return;

  const on    = state.sources.filter(s => s.on).length;
  const total = state.sources.length;
  const fetched = longDate(state.updated);
  const feedVer = state.feedVersion;

  const rows = [
    ["Version",  "Wire " + VERSION],
    ["Released", new Date(BUILD_DATE + "T00:00:00").toLocaleDateString(undefined,
                   { day: "numeric", month: "long", year: "numeric" })],
    ["Stories",  state.articles.length
                   ? state.articles.length + " loaded" + (feedVer ? " (feed " + feedVer + ")" : "")
                   : "none loaded"],
    ["Fetched",  fetched || "not yet"],
    ["Sources",  on + " on, " + total + " in the list"],
    ["Showing",  null],
    ["Settings", state.synced ? "Synced across your devices" : "Kept on this device"],
    ["Storage",  state.synced ? "Firebase" : "This device only"],
    ["Network",  null]   /* filled in below, and kept live */
  ];

  list.innerHTML = "";
  rows.forEach(([label, value]) => {
    const dt = document.createElement("dt");
    dt.textContent = label;
    const dd = document.createElement("dd");

    if(label === "Network"){
      dd.id = "net-state";
      dd.appendChild(navigator.onLine ? pill("Online", true) : pill("Offline", false));
    }else if(label === "Showing"){
      const live = new Set(state.sources.filter(s => s.on).map(s => s.id));
      const shown = state.articles.filter(a => live.has(a.source)).length;
      const hidden = state.articles.length - shown;
      dd.textContent = shown + " of " + state.articles.length +
        (hidden ? "  \u2014 " + hidden + " hidden by your source list" : "");
    }else{
      dd.textContent = value;
    }

    list.append(dt, dd);
  });

  note.textContent = state.articles.length
    ? "Advertising, trackers and pop-ups are removed before stories reach this device. " +
      "Saved stories stay readable without a signal."
    : "No stories yet. Once the fetcher is running, headlines arrive here on their own.";

  void renderTraceButtons();
}

/* Temporary. Two small buttons under About: one saves the recorded
   trace as a plain text file, the other clears it. Remove with the
   rest of the trace once this question is answered. */
async function renderTraceButtons(){
  const note = document.getElementById("about-note");
  if(!note) return;

  const host = note.parentNode;
  let box = document.getElementById("trace-box");
  if(!box){
    box = document.createElement("div");
    box.id = "trace-box";
    box.style.marginTop = "1.5rem";
    box.style.paddingTop = "1rem";
    box.style.borderTop = "1px solid var(--rule)";
    host.appendChild(box);

    const title = document.createElement("p");
    title.style.fontWeight = "700";
    title.style.margin = "0 0 0.6rem";
    title.textContent = "Notification trace (temporary)";
    box.appendChild(title);

    const row = document.createElement("div");
    row.style.display = "flex";
    row.style.gap = "0.6rem";

    const save = document.createElement("button");
    save.type = "button";
    save.className = "reset-btn";
    save.textContent = "Save trace as a file";
    onTap(save, async () => downloadTrace(await readTrace()));

    const clear = document.createElement("button");
    clear.type = "button";
    clear.className = "reset-btn";
    clear.textContent = "Clear trace";
    onTap(clear, async () => { await clearTrace(); announce("Trace cleared.", "done"); });

    row.append(save, clear);
    box.appendChild(row);
  }
}

function watchNetwork(){
  const update = () => {
    const dd = document.getElementById("net-state");
    if(!dd) return;
    dd.innerHTML = "";
    dd.appendChild(navigator.onLine ? pill("Online", true) : pill("Offline", false));
  };
  window.addEventListener("online",  update);
  window.addEventListener("offline", update);
}

/* ---------------- start ---------------- */

async function start(){
  /* Asks the browser to treat this site's storage as important enough
     not to clear under normal pressure. Not honoured the same way
     everywhere, and Safari is among the least reliable about it — but
     it costs nothing to ask. */
  navigator.storage?.persist?.().catch(() => {});

  const conn = await store.init();

  const [settings, savedSources, standard] = await Promise.all([
    store.loadSettings(),
    store.loadSources(),
    store.loadStandard()
  ]);

  state.sources  = savedSources;
  state.standard = standard;
  state.synced  = conn.synced === true;
  display.setup({ settings, announce });

  await loadArticles();

  /* Only sends the reader back to the main feed if nothing is already
     open. pageshow can fire, and checkForNotifiedArticle can succeed,
     while this function is still in the middle of its own setup — an
     early notification check finishing first should not be silently
     overwritten by this routine finishing later. */
  if(document.body.dataset.view !== "reader") ctx.show("feed");
  ctx.refresh();
  renderAbout();
  watchNetwork();
  registerWorker();
  notifications.setup({ announce, onTap });

  void scheduleNotificationCheck();

  const btn = document.getElementById("refresh");
  if(btn) onTap(btn, refresh);

  measureWidth();

  /* Coming back to the app after a while is the moment somebody
     wants the news to be current. Check quietly then — no toast
     unless something actually arrived. */
  document.addEventListener("visibilitychange", async () => {
    if(document.hidden) return;
    const stale = !state.updated ||
      (Date.now() - new Date(state.updated).getTime()) > 5 * 60000;
    if(!stale) return;

    const before = state.articles.length;
    await loadArticles();
    state.sources = await store.loadSources();
    ctx.refresh();
    renderAbout();
    const gained = state.articles.length - before;
    if(gained > 0) announce(gained + (gained === 1 ? " new story" : " new stories"), "undone");
  });
}

start();
