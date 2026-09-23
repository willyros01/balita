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
const VERSION = "wire-v0.17.51";
const NOTIFICATION_MAX_AGE_MS = 30 * 60 * 1000;

/* ---------------- durable storage: IndexedDB ----------------
   Cache Storage was tried first and proved unreliable specifically for
   this: a write would succeed, and reading it back immediately would
   confirm it was genuinely present, yet the same record would be gone
   by the time anything read it later — consistently, after the app had
   been sitting in the background rather than freshly launched. Cache
   Storage is built for HTTP response caching, not a small durable
   record, and iOS reclaiming it under exactly that circumstance was
   the simplest explanation that fit everything seen. IndexedDB is
   built specifically for a page's own durable data and is shared
   between this worker and the page through the same database. */
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

/* ---------------- trace ----------------
   A single switch, not code to add and remove each time. The mystery
   this was built to chase is solved — a confirmed, unfixable Apple
   platform bug, not anything in these files (see the long comment on
   TRACE_ENABLED in app.js for the sourced explanation). Off by
   default now. If tracing is ever needed again, for this or anything
   else, flipping this one line back to true brings all of it back
   exactly as it was, with nothing to rebuild.

   Keep this in step with the matching switch in app.js — the two
   files can't share a constant directly, the same reason VERSION
   above has to be kept in step with version.js by hand. */
const TRACE_ENABLED = false;

async function trace(sentence){
  if(!TRACE_ENABLED) return;
  try{
    const stamp = Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
    const t = new Date().toISOString().slice(11, 23);
    await idbPut(TRACE_STORE, stamp, { t, who: "the worker", sentence });
  }catch(err){ /* Never let recording break the thing being recorded. */ }
}

async function idbPut(store, key, value){
  /* One retry, on any failure at all. The one moment this matters —
     the very first write of a fresh install, before the database has
     ever been touched — is also the one moment most likely to race
     against its own creation. A second attempt, a beat later, costs
     nothing when the first one succeeds, and catches exactly that
     narrow window when it doesn't. */
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
    Promise.all([
      caches.open(VERSION)
        /* addAll is all-or-nothing: one missing file and the entire
           install fails, leaving the old worker in place. Added one at
           a time so a gap costs that file's offline copy and nothing
           more. */
        .then(cache => Promise.all(
          SHELL.map(url => cache.add(url).catch(() => {}))
        )),

      /* Creates the durable database now, during installation — a
         moment the browser is documented to give a real, reliable
         amount of time to, rather than leaving its first-ever creation
         to happen inside a push handler later, arriving in the far
         more constrained moment of the app sitting backgrounded. A
         database that already exists by the time the first real push
         arrives has nothing left to create under pressure. */
      openDB().catch(() => {})
    ])
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      /* The route lives in IndexedDB now, not here, so every cache
         found at this point is safe to remove. */
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
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

/* The durable record of where a notification should lead.

   Written twice, independently: once here, the instant a push
   arrives, before the notification is even shown — and once more
   below, at the moment it is tapped, as a second, redundant chance
   at the same outcome. Neither write depends on the other having
   succeeded.

   Keyed by the article's own id rather than one fixed slot, so more
   than one pending story can exist at once without a newer one
   silently erasing an older one that hasn't been opened yet. The
   sender no longer limits itself to one alert per half hour, so this
   can no longer assume there is ever only one to keep track of. */
async function writeNotificationRoute(articleId, sentAt){
  if(!articleId) return;
  await idbPut(ROUTE_STORE, articleId, {
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
    await trace("A push arrived for article \u201c" + articleId + "\u201d, headline: " + headline);

    try{ await writeNotificationRoute(articleId, sentAt); }
    catch(err){ /* The tap below writes it again as a second chance. */ }

    /* The one condition where a tap on this specific notification
       cannot be trusted to open this specific story: the app is
       already running somewhere, AND at least one other Wire
       notification is already waiting alongside this new one. Under
       exactly those two conditions, tapping any of them may not fire
       the event that tells this app which one was pressed at all —
       a confirmed WebKit bug (bugs.webkit.org, issue 252544), not
       anything this app does. On a cold start, or when this is the
       only notification waiting, that bug either doesn't apply or
       can't produce a wrong answer, so nothing needs to be said.

       This is the only moment anything can be said about it at all —
       once the bug actually fires, nothing in this app gets a chance
       to say anything, so it has to be said here, before any tap. */
    let warning = "";
    try{
      const [already, windows] = await Promise.all([
        self.registration.getNotifications(),
        self.clients.matchAll({ type: "window", includeUncontrolled: true })
      ]);
      const appAlreadyRunning = windows.some(w => w.url.startsWith(self.registration.scope));
      const otherNotificationsWaiting = already.length >= 1;
      if(appAlreadyRunning && otherNotificationsWaiting){
        warning = " (with others waiting, tapping may open a different one)";
      }
    }catch(err){ /* If this check itself fails, showing the notification plainly is still correct. */ }

    await self.registration.showNotification("Wire · " + source, {
      body: headline + warning,
      icon: new URL("icon-192.png", self.registration.scope).href,
      badge: new URL("icon-192.png", self.registration.scope).href,
      tag: articleId ? "wire-breaking-" + articleId : "wire-breaking",
      renotify: false,
      timestamp: Number.isFinite(sentAtMs) ? sentAtMs : Date.now(),
      data: { articleId, sentAt }
    });

    await trace("Showed the banner for article \u201c" + articleId + "\u201d" + (warning ? ", with the multiple-waiting warning." : "."));
  })());
});

self.addEventListener("notificationclick", event => {
  event.notification.close();

  const articleId = String(event.notification.data?.articleId || "");
  const sentAt = String(event.notification.data?.sentAt || "");
  const tag = String(event.notification.tag || "");

  event.waitUntil((async () => {
    /* This is the single most important line in this whole trace. It
       records exactly what the operating system itself claims about
       the banner that was just tapped — not what this code assumes,
       what the OS actually handed over. If the wrong article is ever
       named here, for a tap that was clearly on a different banner,
       that points at something happening before this code ever runs
       at all, not at anything in these files. */
    await trace("A notification was tapped. The operating system says this banner belongs to article \u201c" +
      articleId + "\u201d, tagged \u201c" + tag + "\u201d, originally sent at " + sentAt + ".");

    /* Redundant with the write at arrival above — cheap, and a second
       independent chance costs nothing even when it is usually
       unnecessary by the time a tap happens. */
    try{ await writeNotificationRoute(articleId, sentAt); }catch(err){ /* already tried once above */ }

    /* This is the one piece of information a tap gives with total
       certainty: exactly which banner was pressed. The general queue
       above exists for when there is no such certainty at all — the
       app being opened from its icon, or switched back to without any
       specific tap — and picks whatever is oldest as its best guess in
       that situation. A real tap should never have to rely on a guess
       about itself. Recorded separately, and deliberately overwritten
       by whichever tap happens most recently, so if several banners
       are pressed in quick succession the last one pressed is the one
       honoured, matching what tapping a specific thing means. */
    if(articleId){
      try{
        await idbPut(LAST_TAP_STORE, LAST_TAP_KEY, { articleId, sentAt });
        await trace("Recorded article \u201c" + articleId + "\u201d as the one specifically tapped, for the page to read.");
      }
      catch(err){ await trace("Could not record the tapped article \u2014 " + String(err?.message || err)); }
    }

    /* A cold launch reliably forces a real page load; asking an
       existing window to merely come forward did not reliably wake
       the page's own checks. Asking that same existing window to
       reload first, before falling back to a plain focus if the
       reload is refused, gives a resume the same page-load signal a
       cold launch already gets. */
    const windows = await self.clients.matchAll({
      type: "window",
      includeUncontrolled: true
    });
    const existing = windows.find(client =>
      client.url.startsWith(self.registration.scope)
    );

    if(!existing){
      await trace("No app window was already open \u2014 this is a COLD START. Opening a brand new one.");
      return self.clients.openWindow(self.registration.scope);
    }

    await trace("Found an app window already open \u2014 this is a BACKGROUND-TO-FOREGROUND resume, not a cold start. Asking it to reload and come forward.");
    try{
      const reloaded = await existing.navigate(self.registration.scope);
      await trace("The reload was accepted.");
      return (reloaded || existing).focus();
    }catch(err){
      await trace("The reload was refused \u2014 " + String(err?.message || err) + ". Focusing the window as it already was instead.");
      return existing.focus();
    }
  })());
});
