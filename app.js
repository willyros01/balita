/* ============================================================
   app.js — the wiring. Loads settings and sources, fetches the
   stories, hands a small shared context to each module.

   Nothing in here draws anything itself.
   ============================================================ */

import { FEED_URL, VERSION, BUILD_DATE } from "./config.js";
import { toast } from "./ui.js";
import * as store   from "./store.js";
import * as display from "./display.js";
import * as feed    from "./feed.js";
import * as reader  from "./reader.js";
import * as sources from "./sources.js";

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

async function loadArticles(){
  try{
    const res = await fetch(FEED_URL, { cache: "no-cache" });
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
  ctx.show("feed");
  ctx.refresh();
  window.scrollTo(0, 0);
});

/* ---------------- offline ---------------- */

function registerWorker(){
  if(!("serviceWorker" in navigator)) return;
  if(location.protocol === "file:") return;   /* only works over http */

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(err => {
      console.warn("Offline support unavailable.", err);
    });
  });
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
}

start();
