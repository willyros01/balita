/* ============================================================
   sw.js — makes the app work without a signal.

   Two rules:
     The app itself   cache first, so it opens instantly.
     The stories      network first, falling back to the last
                      copy that was fetched.

   Bump VERSION whenever you change any file in SHELL. That is
   what makes phones pick up a new build.
   ============================================================ */

/* Written out rather than imported.

   This read the version from another file, which meant that if that
   file failed to load for any reason the worker threw on install —
   and a worker that fails to install leaves the previous one in
   charge, serving the old app indefinitely. A fix could then be
   uploaded and have no effect at all, with nothing to show why.
   Keep it in step with version.js by hand; the cost of forgetting is
   one stale cache, not a permanently frozen app. */
const VERSION = "wire-v0.17.43";
const NOTIFICATION_MAX_AGE_MS = 30 * 60 * 1000;

/* ---------------- durable storage, moved to IndexedDB ----------------
   Every earlier version of this kept the notification's destination,
   and the trace recording it, in Cache Storage. Direct evidence finally
   proved what was happening there: a write would succeed, and reading
   it back immediately afterward would confirm it was genuinely present
   — yet by the time anything later looked for that same record, it was
   gone, consistently, specifically after the app had been sitting in
   the background rather than freshly launched. Cache Storage is built
   around HTTP caching semantics; nothing here is actually an HTTP
   response, and iOS reclaiming it under exactly that circumstance,
   while leaving a fresh launch untouched, is the simplest explanation
   that fits everything seen so far.

   IndexedDB is a genuinely different storage system, built for exactly
   this kind of small durable record rather than cached responses, and
   is available to both this worker and the page from the same shared
   database. Moving both the route and the trace into it is one change,
   not two — everything that reads or writes either one goes through
   the small helper below instead of the Cache API. */
const DB_NAME = "wire-durable";
const DB_VERSION = 1;
const ROUTE_STORE = "route";
const TRACE_STORE = "trace";

function openDB(){
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if(!db.objectStoreNames.contains(ROUTE_STORE)) db.createObjectStore(ROUTE_STORE);
      if(!db.objectStoreNames.contains(TRACE_STORE)) db.createObjectStore(TRACE_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbPut(store, key, value){
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    tx.objectStore(store).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbGet(store, key){
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readonly");
    const req = tx.objectStore(store).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbDelete(store, key){
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    tx.objectStore(store).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/* ---------------- trace ----------------
   Every call writes to its own key, stamped with the time and something
   to keep same-millisecond calls apart, rather than one shared record —
   an earlier version shared one array and lost lines when two events
   fired close together, since each read the record before the other had
   finished writing it back. Nothing here is ever read before writing,
   so there is nothing left to race. Remove once the underlying storage
   question is settled. */
async function trace(step){
  try{
    const stamp = Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
    const t = new Date().toISOString().slice(11, 23);
    await idbPut(TRACE_STORE, stamp, { t, who: "worker", step });
  }catch(err){ /* Never let recording break the thing being recorded. */ }
}

const SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./tokens.css",
  "./app.css",
  "./app.js",
  "./notifications.js",
  "./config.js",
  "./store.js",
  "./display.js",
  "./version.js",
  "./sun.js",
  "./ui.js",
  "./articles.json",
  "./sources.json",
  "./icon-180.png",
  "./icon-192.png",
  "./icon-512.png",
  "./sources.js",
  "./lock.js",
  "./feed.js",
  "./reader.js"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(VERSION)
      /* addAll is all-or-nothing: one missing file and the entire
         install fails, leaving the old worker in place. Added one at
         a time so a gap costs that file's offline copy and nothing
         more. */
      .then(cache => Promise.all(
        SHELL.map(url => cache.add(url).catch(() => {}))
      ))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      /* The route and the trace no longer live here at all now, so
         there is nothing of theirs left for this cleanup to protect —
         every cache found at this point is safe to remove. */
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => trace("activate \u2014 this worker just took over"))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const req = event.request;
  if(req.method !== "GET") return;

  const url = new URL(req.url);

  /* Stories and the source list: try the network first so both stay
     current, keeping the last good copy for when there is no signal.

     The source list was cached like the shell until 0.7.0, which meant
     a feed added to sources.json never reached a device that had
     already loaded once. It is data, not shell. */
  if(url.pathname.endsWith("articles.json") ||
     (url.pathname.includes("/articles/") && url.pathname.endsWith(".json")) ||
     url.pathname.endsWith("sources.json")){
    event.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(VERSION).then(c => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  /* Everything else: cache first. */
  event.respondWith(
    caches.match(req).then(hit => hit || fetch(req).then(res => {
      if(url.origin === self.location.origin && res.ok){
        const copy = res.clone();
        caches.open(VERSION).then(c => c.put(req, copy));
      }
      return res;
    }).catch(() => hit))
  );
});

/* Lets the page force an update without the user clearing anything. */
self.addEventListener("message", event => {
  if(event.data === "skip-waiting") self.skipWaiting();
});

/* ---------------- breaking-news push ----------------

   These are ordinary web notifications. No sound, critical-alert flag,
   time-sensitive flag or persistent prompt is requested, leaving Focus
   and Do Not Disturb entirely under the device's control. */

/* The one durable record of where a notification should lead.

   Written twice, independently: once here, the instant a push
   arrives, before the notification is even shown — and once more
   below, at the moment it is tapped, as a second, redundant chance
   at the same outcome. Neither write depends on the other having
   succeeded. One fixed key: the newest notification always simply
   replaces whatever was there before, which is correct because the
   sender itself never allows two alerts within the same half hour. */
async function writeNotificationRoute(articleId, sentAt){
  if(!articleId) return;
  await idbPut(ROUTE_STORE, "current", {
    articleId,
    sentAt: sentAt || new Date().toISOString()
  });
}

self.addEventListener("push", event => {
  let payload = {};
  try{ payload = event.data ? event.data.json() : {}; }
  catch(err){ payload = { data: { title: event.data ? event.data.text() : "" } }; }

  const data = payload.data || {};
  const articleId = String(data.articleId || "");
  const source = String(data.sourceName || "News");
  const headline = String(data.title || "Breaking news");
  const sentAt = String(data.sentAt || "");
  const sentAtMs = Date.parse(sentAt);
  if(Number.isFinite(sentAtMs) && Date.now() - sentAtMs > NOTIFICATION_MAX_AGE_MS){
    return;   /* Already too old to be worth showing at all. */
  }

  event.waitUntil((async () => {
    await trace("push received for " + (articleId || "no id"));

    /* Written before the notification is even displayed, normally. If
       it throws, the failure is folded into the banner's own text
       instead of being swallowed — the one channel already confirmed
       to reach the device reliably on every test so far, regardless of
       anything else failing. */
    let writeFailure = "";
    let confirmed = false;
    try{
      await writeNotificationRoute(articleId, sentAt);
      await trace("route written at arrival");

      /* Read the same record straight back, in the same breath, before
         doing anything else. Proved genuinely necessary once already:
         Cache Storage accepted this same write and still lost it later,
         so a write not throwing is confirmation of nothing on its own. */
      const savedBack = await idbGet(ROUTE_STORE, "current");
      confirmed = String(savedBack?.articleId || "") === articleId;
      await trace(confirmed ? "read-back confirmed it" : "EXIT: read-back found nothing");
    }catch(err){
      writeFailure = String(err?.message || err);
      await trace("EXIT: route write failed \u2014 " + writeFailure);
    }

    const diagnostic = writeFailure ? "  [write failed: " + writeFailure + "]" :
      !confirmed ? "  [write did not verify]" : "";

    await self.registration.showNotification("Wire · " + source, {
      body: headline + diagnostic,
      icon: new URL("icon-192.png", self.registration.scope).href,
      badge: new URL("icon-192.png", self.registration.scope).href,
      tag: articleId ? "wire-breaking-" + articleId : "wire-breaking",
      renotify: false,
      timestamp: Number.isFinite(sentAtMs) ? sentAtMs : Date.now(),
      data: { articleId, sentAt }
    });
    await trace("notification shown" + (diagnostic ? " (with a diagnostic in the body)" : ""));
  })());
});

self.addEventListener("notificationclick", event => {
  event.notification.close();

  const articleId = String(event.notification.data?.articleId || "");
  const sentAt = String(event.notification.data?.sentAt || "");

  event.waitUntil((async () => {
    await trace("tap received for " + (articleId || "no id"));

    /* Redundant with the write at arrival above — cheap, and a second
       independent chance costs nothing even when it is usually
       unnecessary by the time a tap happens. Traced separately from
       the push-time write on purpose: if this one succeeds where the
       earlier one is later found missing, or vice versa, that
       difference is itself useful evidence. */
    try{
      await writeNotificationRoute(articleId, sentAt);
      await trace("route write at tap: succeeded");
    }catch(err){
      await trace("route write at tap: FAILED \u2014 " + String(err?.message || err));
    }

    /* A cold launch has passed every single test run so far. A resume
       from the background has failed every single one. The structural
       difference between them: a cold launch always forces a real page
       load, and a resume never asked for one — it only asked the
       existing window to come forward. This asks for a real reload on
       that same existing window too, before falling back to a plain
       focus if the reload is refused, so the resume case gets the same
       page-load signal the cold case already relies on. */
    const windows = await self.clients.matchAll({
      type: "window",
      includeUncontrolled: true
    });
    const existing = windows.find(client =>
      client.url.startsWith(self.registration.scope)
    );

    if(!existing){
      await trace("no existing window, opening one");
      return self.clients.openWindow(self.registration.scope);
    }

    try{
      const reloaded = await existing.navigate(self.registration.scope);
      await trace("existing window reloaded");
      return (reloaded || existing).focus();
    }catch(err){
      await trace("reload was refused \u2014 " + String(err?.message || err) + ", focusing as-is");
      return existing.focus();
    }
  })());
});
