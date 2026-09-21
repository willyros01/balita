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
const VERSION = "wire-v0.17.33";
/* Kept outside the shell cache so an app update cannot erase a notification
   tap before the page has had a chance to consume it. */
const NOTIFICATION_ROUTE_CACHE = "wire-notification-route-v1";
const NOTIFICATION_ROUTE_URL = new URL(
  ".wire-notification-route.json",
  self.registration.scope
).href;
const NOTIFICATION_MAX_AGE_MS = 30 * 60 * 1000;

/* ---------------- durable trace ----------------
   Temporary. Records what the notification path actually did.

   The worker and the page each get their OWN record now, capped
   separately. The first version shared one record, and the page's
   once-a-second heartbeat was almost certainly evicting the worker's
   lines — tap received, route written — before anyone got to read
   them. Splitting them means the worker's handful of lines can never
   be pushed out by the page's much more frequent ones.

   Remove all of this once the fault is found. */
const TRACE_CACHE = "wire-trace-v2";
const TRACE_WORKER_URL = new URL(".wire-trace-worker.json", self.registration.scope).href;

async function trace(step){
  try{
    const cache = await caches.open(TRACE_CACHE);
    let log = [];
    const existing = await cache.match(TRACE_WORKER_URL);
    if(existing) log = await existing.json();
    log.push(new Date().toISOString().slice(11, 23) + "  worker  " + step);
    if(log.length > 200) log = log.slice(-200);
    await cache.put(TRACE_WORKER_URL, new Response(JSON.stringify(log), {
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
    }));
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
      .then(keys => Promise.all(
        keys
          .filter(k => k !== VERSION &&
                       k !== NOTIFICATION_ROUTE_CACHE &&
                       k !== TRACE_CACHE)
          .map(k => caches.delete(k))
      ))
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
    event.waitUntil(trace("push dropped, already older than 30 min"));
    return;
  }
  const path = articleId ? "?article=" + encodeURIComponent(articleId) : "./";

  event.waitUntil((async () => {
    await trace("push shown for " + (articleId || "no id"));
    await self.registration.showNotification("Wire · " + source, {
      body: headline,
      icon: new URL("icon-192.png", self.registration.scope).href,
      badge: new URL("icon-192.png", self.registration.scope).href,
      tag: articleId ? "wire-breaking-" + articleId : "wire-breaking",
      renotify: false,
      timestamp: Number.isFinite(sentAtMs) ? sentAtMs : Date.now(),
      data: { articleId, path, sentAt }
    });
  })());
});

self.addEventListener("notificationclick", event => {
  event.notification.close();

  const articleId = String(event.notification.data?.articleId || "");
  const sentAt = String(event.notification.data?.sentAt || "");
  const sentAtMs = Date.parse(sentAt);
  let target = new URL(event.notification.data?.path || "./", self.registration.scope);
  const scope = new URL(self.registration.scope);
  if(target.origin !== scope.origin || !target.pathname.startsWith(scope.pathname)){
    target = scope;
  }

  event.waitUntil((async () => {
    await trace("tap received for " + (articleId || "no id"));

    const routeSentAt = Number.isFinite(sentAtMs) ? sentAt : new Date().toISOString();
    if(articleId){
      const cache = await caches.open(NOTIFICATION_ROUTE_CACHE);
      await cache.put(NOTIFICATION_ROUTE_URL, new Response(JSON.stringify({
        articleId,
        sentAt: routeSentAt
      }), {
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
      }));
      await trace("route written, sentAt " + routeSentAt);
    }

    const windows = await self.clients.matchAll({
      type: "window",
      includeUncontrolled: true
    });
    let opened = windows.find(client =>
      client.url.startsWith(self.registration.scope)
    ) || null;

    await trace(opened
      ? "existing window found, taking resume path"
      : "no existing window, taking cold launch path");

    if(opened){
      /* iOS can foreground a suspended Home Screen client without delivering
         focus, pageshow, visibilitychange or postMessage to the resumed page.
         Put the exact article id in the client URL first. That forces the same
         durable startup route used by the proven cold-launch path; the page
         still waits until it is visible before opening the reader. */
      let routed = opened;
      let navigated = false;
      try{
        const result = await opened.navigate(target.href);
        routed = result || opened;
        navigated = true;
      }
      catch(err){ await trace("navigate refused: " + (err.message || err)); }
      if(navigated) await trace("navigate accepted");

      await routed.focus();
      await trace("focus called");

      if(articleId){
        for(const delay of [0, 250, 500, 1000, 1500]){
          if(delay) await new Promise(resolve => setTimeout(resolve, delay));
          routed.postMessage({
            type: "wire-open-article",
            articleId,
            sentAt: routeSentAt
          });
        }
        await trace("messages sent to page");
      }
      return routed;
    }

    /* Cold launch remains browser-owned and retains the exact article URL. */
    try{ return await self.clients.openWindow(target.href); }
    catch(err){ await trace("openWindow failed: " + (err.message || err)); return null; }
  })());
});
