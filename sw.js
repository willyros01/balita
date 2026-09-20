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
const VERSION = "wire-v0.17.24";
/* Kept outside the shell cache so an app update cannot erase a notification
   tap before the page has had a chance to consume it. */
const NOTIFICATION_ROUTE_CACHE = "wire-notification-route-v1";
const NOTIFICATION_ROUTE_URL = new URL(
  ".wire-notification-route.json",
  self.registration.scope
).href;
const PUSH_DIAGNOSTICS = "wire-push-diagnostics-v1";
const PUSH_DIAGNOSTICS_URL = new URL(".wire-push-status.json", self.registration.scope).href;
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
          .filter(k => k !== VERSION && k !== NOTIFICATION_ROUTE_CACHE && k !== PUSH_DIAGNOSTICS)
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
  const visible = payload.notification || {};
  const articleId = String(data.articleId || "");
  const source = String(data.sourceName || "News");
  const headline = String(data.title || visible.body || "Breaking news");
  const path = articleId ? "?article=" + encodeURIComponent(articleId) : "./";

  // One display owner: this native push listener. No Firebase SW auto-display listener.
  event.waitUntil((async () => {
    const record = { articleId, receivedAt: new Date().toISOString(), version: VERSION };
    const save = async () => {
      try {
        const cache = await caches.open(PUSH_DIAGNOSTICS);
        await cache.put(PUSH_DIAGNOSTICS_URL, new Response(JSON.stringify(record)));
      } catch (_) { /* Diagnostics must never block display. */ }
    };
    try {
      await self.registration.showNotification(visible.title || "Wire · " + source, {
    body: headline,
    icon: new URL("icon-192.png", self.registration.scope).href,
    badge: new URL("icon-192.png", self.registration.scope).href,
    tag: articleId ? "wire-breaking-" + articleId : "wire-breaking",
    renotify: false,
    data: { articleId, path }
      });
      record.displayedAt = new Date().toISOString();
    } catch (err) {
      record.error = String(err.message || err);
    }
    await save();
  })());
});

self.addEventListener("notificationclick", event => {
  event.notification.close();

  const articleId = String(event.notification.data?.articleId || "");
  let target = new URL(event.notification.data?.path || "./", self.registration.scope);
  const scope = new URL(self.registration.scope);
  if(target.origin !== scope.origin || !target.pathname.startsWith(scope.pathname)){
    target = scope;
  }

  event.waitUntil((async () => {
    /* A backgrounded iOS Home Screen app can be frozen while postMessage is
       delivered. Persist the destination before waking it; the page removes
       this record only after it has opened the matching story. */
    const clickedAt = new Date().toISOString();
    if(articleId){
      const cache = await caches.open(NOTIFICATION_ROUTE_CACHE);
      await cache.put(NOTIFICATION_ROUTE_URL, new Response(JSON.stringify({
        articleId,
        clickedAt
      }), {
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
      }));
    }

    const wireWindows = () => self.clients.matchAll({
      type: "window",
      includeUncontrolled: true
    }).then(clients => clients.filter(client =>
      client.url.startsWith(self.registration.scope)
    ));

    const broadcast = async () => {
      if(!articleId) return [];
      const clients = await wireWindows();
      clients.forEach(client => client.postMessage({
        type: "wire-open-article",
        articleId,
        clickedAt
      }));
      return clients;
    };

    /* Tell an existing page before asking iOS to foreground it. WebKit can
       restore a frozen Home Screen window without delivering a later focus,
       pageshow, visibility or message event. */
    const existing = await broadcast();

    /* The cold-launch path has opened the correct article reliably on iPhone.
       Use that same browser-owned launch operation even when a Wire window is
       already present. iOS can ignore WindowClient.navigate() on a suspended
       Home Screen app and merely restore its old scroll position. */
    let opened = null;
    try{ opened = await self.clients.openWindow(target.href); }
    catch(err){ /* Fall back to the existing client below. */ }

    if(!opened){
      opened = existing[0] || null;
    }

    if(opened) await opened.focus();
    if(opened && "navigate" in opened){
      try{ opened = await opened.navigate(target.href) || opened; }
      catch(err){ /* Cache polling and broadcasts remain independent paths. */ }
    }
    if(opened && articleId){
      /* Re-query all clients on every attempt. iOS may replace the original
         WindowClient object while restoring the Home Screen application. */
      for(const delay of [0, 500, 1000, 1500, 2000]){
        if(delay) await new Promise(resolve => setTimeout(resolve, delay));
        await broadcast();
      }
    }
    return opened;
  })());
});

