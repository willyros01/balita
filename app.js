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

/* ---------------- breaking-news notifications ----------------

   One routine, triggered only by the app becoming visible — never by
   the tap directly, never by a timer. Tapping a notification, opening
   the Home Screen icon, and switching back to an already-open tab all
   lead here the same way.

   Earlier versions tried to actively steer the moment of the tap
   itself: forcing a specific navigation, relaying a live message to
   the page, retrying on a delay ladder in case a frozen window woke
   up partway through. All of that was scaffolding for a cause that
   was not yet known. Once it was — that the tap handler can simply
   not run at all after the app has sat backgrounded for a while —
   none of that scaffolding could have helped anyway, since it all
   depended on the very handler that might not run. What is reliable,
   confirmed across every real test, is that the page always learns
   when it becomes visible. So that is the only signal this depends
   on now. The destination itself lives in durable storage, written
   the moment the notification arrived — see sw.js — and is simply
   read back here, once, whenever there is a reason to look. */
const NOTIFICATION_ROUTE_CACHE = "wire-notification-route-v1";
const NOTIFICATION_ROUTE_MAX_AGE_MS = 30 * 60 * 1000;
let notificationCheckRunning = false;
let lastOpenedNotificationArticle = "";

async function readNotificationRoute(){
  if(!("caches" in window)) return null;

  const cache = await caches.open(NOTIFICATION_ROUTE_CACHE);
  const requests = await cache.keys();
  for(const request of requests){
    const response = await cache.match(request);
    if(!response) continue;
    const saved = await response.json();
    const articleId = String(saved.articleId || "");
    const sentAt = String(saved.sentAt || "");
    if(articleId) return { articleId, sentAt, cache, request };
  }
  return null;
}

async function clearNotificationRoute(route){
  if(!route?.cache || !route?.request) return;
  await route.cache.delete(route.request);
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
  /* A notification is an entrance into this publisher's headline grouping,
     not into whatever All Sources position happened to be open beforehand. */
  state.filter = article.source;
  ctx.show("feed");
  ctx.refresh();

  const card = Array.from(document.querySelectorAll("[data-article-id]"))
    .find(node => node.dataset.articleId === article.id);
  if(card) window.scrollTo(0, Math.max(0, card.offsetTop - 16));
}

async function checkForNotifiedArticle(){
  if(notificationCheckRunning) return;
  if(document.visibilityState !== "visible") return;

  notificationCheckRunning = true;
  try{
    const route = await readNotificationRoute();
    if(!route) return;

    if(route.articleId === lastOpenedNotificationArticle){
      await clearNotificationRoute(route);
      return;
    }

    const sentAtMs = Date.parse(route.sentAt || "");
    if(Number.isFinite(sentAtMs) && Date.now() - sentAtMs > NOTIFICATION_ROUTE_MAX_AGE_MS){
      await clearNotificationRoute(route);
      announce("This notification has expired. Showing current headlines.", "warn");
      return;
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
      /* Not found even after a fresh fetch. Leave the route in place —
         a later check may still find it once a newer fetch lands, and
         the expiry rule above is what eventually retires it if it
         never does. Nothing to announce here; announcing would repeat
         on every visibility change while it remains missing. */
      return;
    }

    prepareNotificationReturn(article);
    ctx.openArticle(route.articleId);
    lastOpenedNotificationArticle = route.articleId;
    await clearNotificationRoute(route);
  }catch(err){
    console.warn("Could not check for a notified story.", err);
  }finally{
    notificationCheckRunning = false;
  }
}

window.addEventListener("pageshow", checkForNotifiedArticle);
window.addEventListener("focus", checkForNotifiedArticle);
document.addEventListener("visibilitychange", () => {
  if(document.visibilityState === "visible") checkForNotifiedArticle();
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
      /* Loaded and displayed are different numbers, and when they
         differ that is exactly the fault worth surfacing. */
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

  /* Covers a cold start: the app may have been launched fresh by a tap
     while nothing was already running, and there is no other visibility
     event coming to trigger the check on its own. */
  void checkForNotifiedArticle();

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
