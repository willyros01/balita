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

/* ---------------- durable trace ----------------
   Temporary. The notification path had four ways to exit in silence,
   which made it impossible to tell from the outside which one was
   being taken. Each now says so.

   The worker and the page each keep their OWN record now, in
   separate keys of the same cache. The first version shared one
   record, and this page's own once-a-second heartbeat was almost
   certainly evicting the worker's few, crucial lines — tap received,
   route written — long before anyone got to read them. They are
   merged back together, in order, only when displayed.

   The heartbeat itself also no longer writes a line on every tick
   when it finds nothing — that was the actual source of the flood.
   It now only speaks when something changes.

   Remove all of this once the fault is found. */
const TRACE_CACHE = "wire-trace-v2";
const TRACE_WORKER_URL_NAME = ".wire-trace-worker.json";
const TRACE_PAGE_URL_NAME = ".wire-trace-page.json";
let traceWorkerUrl = "";
let tracePageUrl = "";

async function traceTargets(){
  if(traceWorkerUrl && tracePageUrl){
    return { worker: traceWorkerUrl, page: tracePageUrl };
  }
  let base = location.href;
  try{
    const reg = await navigator.serviceWorker?.getRegistration();
    if(reg?.scope) base = reg.scope;
  }catch(err){ /* fall back to location.href */ }
  traceWorkerUrl = new URL(TRACE_WORKER_URL_NAME, base).href;
  tracePageUrl = new URL(TRACE_PAGE_URL_NAME, base).href;
  return { worker: traceWorkerUrl, page: tracePageUrl };
}

async function trace(step){
  try{
    if(!("caches" in window)) return;
    const { page } = await traceTargets();
    const cache = await caches.open(TRACE_CACHE);
    let log = [];
    const existing = await cache.match(page);
    if(existing) log = await existing.json();
    log.push(new Date().toISOString().slice(11, 23) + "  page    " + step);
    if(log.length > 200) log = log.slice(-200);
    await cache.put(page, new Response(JSON.stringify(log), {
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
    }));
  }catch(err){ /* Never let recording break the thing being recorded. */ }
}

async function readTrace(){
  try{
    if(!("caches" in window)) return [];
    const { worker, page } = await traceTargets();
    const cache = await caches.open(TRACE_CACHE);
    const [workerRes, pageRes] = await Promise.all([
      cache.match(worker),
      cache.match(page)
    ]);
    const workerLog = workerRes ? await workerRes.json() : [];
    const pageLog = pageRes ? await pageRes.json() : [];
    /* Both use the same HH:MM:SS.mmm clock, taken on the same device,
       so a plain text sort interleaves them correctly. */
    return [...workerLog, ...pageLog].sort();
  }catch(err){ /* nothing recorded yet */ }
  return [];
}

async function clearTrace(){
  try{
    if(!("caches" in window)) return;
    await caches.delete(TRACE_CACHE);
    traceWorkerUrl = "";
    tracePageUrl = "";
  }catch(err){ /* nothing to clear */ }
}

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

let notificationClicksReady = false;
let notificationRouteProcessing = false;
let notificationRouteWakeRequested = false;
let notificationRetryTimer = 0;
let lastNotificationArticle = "";
let launchNotificationConsumed = false;
const NOTIFICATION_ROUTE_CACHE = "wire-notification-route-v1";
const NOTIFICATION_ROUTE_MAX_AGE_MS = 30 * 60 * 1000;
const launchNotificationArticle =
  new URLSearchParams(location.search).get("article") || "";

function notificationPageIsActive(){
  return document.visibilityState === "visible";
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

async function cachedNotificationRoute(){
  if(!("caches" in window)) return null;

  const cache = await caches.open(NOTIFICATION_ROUTE_CACHE);
  const requests = await cache.keys();
  for(const request of requests){
    const response = await cache.match(request);
    if(!response) continue;
    const saved = await response.json();
    const articleId = String(saved.articleId || "");
    const sentAt = String(saved.sentAt || saved.clickedAt || "");
    if(articleId) return { articleId, sentAt, cache, request };
  }
  return null;
}

async function clearNotificationRoute(route){
  if(!route?.cache || !route?.request) return;

  /* A newer notification may replace the single durable record while the
     current article is opening. Never let the older transaction erase it. */
  const response = await route.cache.match(route.request);
  if(!response) return;
  const current = await response.json();
  if(String(current.articleId || "") === route.articleId){
    await route.cache.delete(route.request);
  }
}

function scheduleNotificationRetry(){
  if(notificationRetryTimer) return;
  notificationRetryTimer = window.setTimeout(() => {
    notificationRetryTimer = 0;
    wakeNotificationRouteProcessor();
  }, 2500);
}

async function nextNotificationRoute(){
  const saved = await cachedNotificationRoute();
  if(saved) return saved;

  if(!launchNotificationConsumed && launchNotificationArticle){
    return {
      articleId: launchNotificationArticle,
      sentAt: "",
      cache: null,
      request: null,
      launchFallback: true
    };
  }
  return null;
}

/* The only function allowed to validate, load, open or clear a notification.
   Lifecycle events and service-worker messages merely wake the serialized
   processor below. */
async function consumeOneNotificationRoute(reason){
  /* The heartbeat calls this once a second for as long as the app is
     open, purely as a routine check. Tracing every one of those,
     finding nothing, was the actual flood that pushed the worker's
     handful of real lines out of the record before anyone could read
     them — not the worker writing too much, but the page writing far
     too often about nothing happening. A real wake, from a tap or a
     lifecycle event, is still always worth a line either way. */
  const quiet = reason === "heartbeat";

  if(!notificationClicksReady){
    if(!quiet) await trace("EXIT: startup not finished yet");
    return "waiting";
  }
  if(!notificationPageIsActive()){
    if(!quiet) await trace("EXIT: page reports itself hidden");
    return "waiting";
  }

  const route = await nextNotificationRoute();
  if(!route){
    if(!quiet) await trace("EXIT: no route found in the cache");
    return "empty";
  }

  const articleId = route.articleId;
  await trace("route read: " + articleId + (route.launchFallback ? " (from launch url)" : " (from cache)"));

  const sentAt = Date.parse(route.sentAt || "");
  if(Number.isFinite(sentAt) &&
     Date.now() - sentAt > NOTIFICATION_ROUTE_MAX_AGE_MS){
    const mins = Math.round((Date.now() - sentAt) / 60000);
    await trace("EXIT: expired, sent " + mins + " min ago");
    await clearNotificationRoute(route);
    if(route.launchFallback) launchNotificationConsumed = true;
    ctx.show("feed");
    ctx.refresh();
    announce("This notification has expired. Showing current headlines.", "warn");
    return "expired";
  }

  if(articleId === lastNotificationArticle){
    await trace("EXIT: already opened this one in this session");
    await clearNotificationRoute(route);
    if(route.launchFallback) launchNotificationConsumed = true;
    return "duplicate";
  }

  /* This visible acknowledgement is emitted before any network or reader work,
     so both cold launch and background resume expose the same deterministic
     path to the user. */
  await trace("reached the announce step");
  announce("Opening the notified story\u2026", "undone");

  if(!state.articles.some(article => article.id === articleId)){
    await loadNotificationArticle(articleId);
  }
  if(!state.articles.some(article => article.id === articleId)){
    await loadArticles(true);
    ctx.refresh();
  }

  if(!notificationPageIsActive()){
    await trace("EXIT: went hidden while loading");
    return "waiting";
  }

  const article = state.articles.find(item => item.id === articleId);
  if(!article){
    await trace("EXIT: story not found in the feed, will retry");
    scheduleNotificationRetry();
    return "retry";
  }

  prepareNotificationReturn(article);
  ctx.openArticle(articleId);
  history.replaceState(null, "", location.pathname + location.hash);
  lastNotificationArticle = articleId;
  if(route.launchFallback) launchNotificationConsumed = true;
  await clearNotificationRoute(route);
  await trace("OPENED the article");
  return "opened";
}

let notificationLastWakeReason = "";

function wakeNotificationRouteProcessor(reason){
  notificationLastWakeReason = reason || "";
  notificationRouteWakeRequested = true;
  if(notificationRouteProcessing) return;

  notificationRouteProcessing = true;
  void (async () => {
    try{
      while(notificationRouteWakeRequested){
        notificationRouteWakeRequested = false;
        if(!notificationClicksReady || !notificationPageIsActive()) break;

        /* Allow iOS to finish restoring its previous screen before the single
           transaction changes Wire's view. */
        await new Promise(resolve => window.setTimeout(resolve, 200));
        if(!notificationPageIsActive()){
          notificationRouteWakeRequested = true;
          break;
        }

        const result = await consumeOneNotificationRoute(notificationLastWakeReason);
        if(result === "retry" || result === "waiting") break;

        /* If a newer route arrived during this transaction, process it next,
           in sequence, without allowing parallel navigation. */
        const next = await nextNotificationRoute();
        if(next && next.articleId !== lastNotificationArticle){
          notificationRouteWakeRequested = true;
        }
      }
    }catch(err){
      await trace("EXIT: threw \u2014 " + (err?.message || err));
      console.warn("Could not process the notification destination.", err);
      scheduleNotificationRetry();
    }finally{
      notificationRouteProcessing = false;
      if(notificationRouteWakeRequested &&
         notificationClicksReady &&
         notificationPageIsActive()){
        window.setTimeout(wakeNotificationRouteProcessor, 0);
      }
    }
  })();
}

function listenForNotificationClicks(){
  if(!("serviceWorker" in navigator)) return;

  navigator.serviceWorker.addEventListener("message", event => {
    if(event.data?.type === "wire-open-article"){
      void trace("woken by: message from worker");
      wakeNotificationRouteProcessor("message");
    }
  });
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    void trace("woken by: controllerchange");
    wakeNotificationRouteProcessor("controllerchange");
  });
}

listenForNotificationClicks();
window.addEventListener("pageshow", () => {
  void trace("woken by: pageshow");
  wakeNotificationRouteProcessor("pageshow");
});
window.addEventListener("focus", () => {
  void trace("woken by: focus");
  wakeNotificationRouteProcessor("focus");
});
document.addEventListener("visibilitychange", () => {
  if(notificationPageIsActive()){
    void trace("woken by: became visible");
    wakeNotificationRouteProcessor("visible");
  }
});

/* iOS does not guarantee a lifecycle event when an installed app thaws.
   The heartbeat is only another wake signal; it cannot read, open or clear a
   route itself, so it cannot race the serialized processor. */
window.setInterval(() => {
  if(notificationPageIsActive()) wakeNotificationRouteProcessor("heartbeat");
}, 1000);

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

    /* Console only now that the layout is behaving. If the drifting
       screen ever returns this names the cause on the first look,
       instead of five rounds of reasoning about it. */
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
      /* Loaded and displayed are different numbers, and when they
         differ that is exactly the fault worth surfacing. */
      const live = new Set(state.sources.filter(s => s.on).map(s => s.id));
      const shown = state.articles.filter(a => live.has(a.source)).length;
      const hidden = state.articles.length - shown;
      dd.textContent = shown + " of " + state.articles.length +
        (hidden ? "  \u2014 " + hidden + " hidden by your source list" : "");
      if(hidden) dd.appendChild(document.createTextNode(""));
    }else{
      dd.textContent = value;
    }

    list.append(dt, dd);
  });

  note.textContent = state.articles.length
    ? "Advertising, trackers and pop-ups are removed before stories reach this device. " +
      "Saved stories stay readable without a signal."
    : "No stories yet. Once the fetcher is running, headlines arrive here on their own.";

  void renderTrace();
}

/* Temporary. Shows the recorded notification path underneath About, so it
   can be read straight off the device. Remove with the rest of the trace. */
async function renderTrace(){
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
  }

  const log = await readTrace();
  box.innerHTML = "";

  const title = document.createElement("p");
  title.style.fontWeight = "700";
  title.style.margin = "0 0 0.5rem";
  title.textContent = "Notification trace (temporary)";
  box.appendChild(title);

  if(!log.length){
    const empty = document.createElement("p");
    empty.style.margin = "0 0 0.75rem";
    empty.textContent = "Nothing recorded yet.";
    box.appendChild(empty);
  }else{
    log.forEach(line => {
      const p = document.createElement("p");
      p.style.margin = "0 0 0.25rem";
      p.style.lineHeight = "1.4";
      p.textContent = line;
      box.appendChild(p);
    });
  }

  const clear = document.createElement("button");
  clear.type = "button";
  clear.className = "reset-btn";
  clear.style.marginTop = "0.75rem";
  clear.textContent = "Clear trace";
  onTap(clear, async () => {
    await clearTrace();
    await renderTrace();
  });
  box.appendChild(clear);
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
  await trace("--- app started, url " +
    (launchNotificationArticle ? "has article=" + launchNotificationArticle : "plain") + " ---");

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

  ctx.show("feed");
  ctx.refresh();
  renderAbout();
  watchNetwork();
  registerWorker();
  notifications.setup({ announce, onTap });

  notificationClicksReady = true;
  await trace("startup finished, processor now allowed to run");
  wakeNotificationRouteProcessor("startup");

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
