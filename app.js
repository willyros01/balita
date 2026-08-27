/* ============================================================
   app.js — the wiring. Loads settings and sources, fetches the
   stories, hands a small shared context to each module.

   Nothing in here draws anything itself.
   ============================================================ */

import { FEED_URL } from "./config.js";
import * as store   from "./store.js";
import * as display from "./display.js";
import * as feed    from "./feed.js";
import * as reader  from "./reader.js";
import * as sources from "./sources.js";

const state = {
  sources:  [],
  articles: [],
  filter:   "ALL",
  updated:  null
};

const sayEl = document.getElementById("announce");

/* Screen readers only speak a live region when the text changes,
   so a repeated message needs a nudge. */
function announce(msg){
  sayEl.textContent = "";
  window.setTimeout(() => { sayEl.textContent = msg; }, 40);
}

const ctx = {
  state,
  announce,
  sourceOf: id => state.sources.find(s => s.id === id),
  show: view => { document.body.dataset.view = view; },
  refresh: () => { feed.renderChips(ctx); feed.renderFeed(ctx); },
  openArticle: id => reader.open(ctx, id),
  openSources: () => sources.show(ctx)
};

/* ---------------- stories ---------------- */

async function loadArticles(){
  try{
    const res = await fetch(FEED_URL, { cache: "no-cache" });
    if(!res.ok) throw new Error("HTTP " + res.status);

    const data = await res.json();
    state.articles = Array.isArray(data.articles) ? data.articles : [];
    state.updated  = data.updated || null;
  }catch(err){
    console.warn("Could not load stories.", err);
    state.articles = [];
    state.updated  = null;
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

/* ---------------- footer note ---------------- */

function setFootnote(synced){
  const el = document.getElementById("footnote");
  if(!el) return;

  el.textContent = state.articles.length
    ? "Advertising, trackers and pop-ups are removed before the stories reach this device. " +
      (synced
        ? "Your sources and settings follow you between devices."
        : "Your sources and settings are kept on this device.")
    : "No stories yet. Once the fetcher is running, headlines arrive here on their own.";
}

/* ---------------- start ---------------- */

async function start(){
  const conn = await store.init();

  const [settings, savedSources] = await Promise.all([
    store.loadSettings(),
    store.loadSources()
  ]);

  state.sources = savedSources;
  display.setup({ settings, announce });

  await loadArticles();

  ctx.show("feed");
  ctx.refresh();
  setFootnote(conn.synced);
  registerWorker();
}

start();
