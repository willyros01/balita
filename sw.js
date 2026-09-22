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
const VERSION = "wire-v0.17.42";

/* Kept outside the shell cache so an app update cannot erase a
   notification's destination before the page has had a chance to
   read it. One fixed key: the newest notification always simply
   replaces whatever was there before, which is correct because the
   sender itself never allows two alerts within the same half hour. */
const NOTIFICATION_ROUTE_CACHE = "wire-notification-route-v1";
const NOTIFICATION_ROUTE_URL = new URL(
  ".wire-notification-route.json",
  self.registration.scope
).href;
const NOTIFICATION_MAX_AGE_MS = 30 * 60 * 1000;

/* ---------------- trace, round three ----------------
   Round two used one shared JSON array: read it, add a line, write the
   whole thing back. Two events firing close together — exactly what a
   notification arriving and being checked for does — could each read
   before the other had written, and whichever wrote second silently
   erased the other's line. That is almost certainly why some real
   traces came back with only one line in them; not a sign that nothing
   else happened, a sign that this recorder lost what did.

   Every call now writes to its own key instead, stamped with the time
   and something to keep same-millisecond calls apart. Nothing is ever
   read before writing, so there is nothing left to race. Reading the
   trace back means listing every key under this prefix and sorting by
   the timestamp embedded in each one. Remove once this question is
   answered. */
const TRACE_CACHE = "wire-trace-v4";
const TRACE_PREFIX = new URL(".wire-trace-", self.registration.scope).href;

async function trace(step){
  try{
    const cache = await caches.open(TRACE_CACHE);
    const stamp = Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
    const t = new Date().toISOString().slice(11, 23);
    await cache.put(TRACE_PREFIX + stamp + ".json", new Response(
      JSON.stringify({ t, who: "worker", step }),
      { headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } }
    ));
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
          .filter(k => k !== VERSION && k !== NOTIFICATION_ROUTE_CACHE && k !== TRACE_CACHE)
          .map(k => caches.delete(k))
      ))
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
   succeeded. */
async function writeNotificationRoute(articleId, sentAt){
  if(!articleId) return;
  const cache = await caches.open(NOTIFICATION_ROUTE_CACHE);
  await cache.put(NOTIFICATION_ROUTE_URL, new Response(JSON.stringify({
    articleId,
    sentAt: sentAt || new Date().toISOString()
  }), {
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
  }));
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

    /* Written before the notification is even displayed, normally.
       If this specific write is what's failing on a device where the
       banner still displays fine, that would explain a tap finding
       nothing without the worker looking dead at all — showing the
       notification and writing the route are two separate steps, and
       nothing has yet proven they always succeed or fail together.

       If it throws, the failure is folded into the banner's own text
       instead of being swallowed — the one channel already confirmed
       to reach the device reliably, so the answer isn't stuck behind
       whatever caused the write to fail in the first place. */
    let writeFailure = "";
    let confirmed = false;
    try{
      await writeNotificationRoute(articleId, sentAt);
      await trace("route written at arrival");

      /* Read the same record straight back, in the same breath, before
         doing anything else. This is not redundant with the write
         above — it answers a different question. The write not
         throwing only means the browser accepted the request; it does
         not prove the record actually exists yet where a later reader
         would find it. Checking immediately, and folding the answer
         into the banner itself, settles that with certainty rather
         than inferring it from what happens minutes later at the tap. */
      const cache = await caches.open(NOTIFICATION_ROUTE_CACHE);
      const readBack = await cache.match(NOTIFICATION_ROUTE_URL);
      const savedBack = readBack ? await readBack.json() : null;
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
       earlier one failed, or vice versa, that difference is itself
       the answer to whether writing ever works on this device at
       all, or whether something is clearing a write that succeeded. */
    try{
      await writeNotificationRoute(articleId, sentAt);
      await trace("route write at tap: succeeded");
    }catch(err){
      await trace("route write at tap: FAILED \u2014 " + String(err?.message || err));
    }

    /* A cold launch has passed every single test run so far. A resume
       from the background has failed every single one. The structural
       difference between them is exactly this: a cold launch always
       forces a real page load, and a resume never asked for one — it
       only asked the existing window to come forward, on the
       assumption that would be enough to wake the page's own checks.

       That assumption is what this replaces. A real reload is the one
       thing every passing case has in common, so a resume now asks
       for one too, on the same existing window, before falling back
       to a plain focus if the reload itself is refused. This is not
       the forced navigation removed earlier for a different reason —
       that one fired repeatedly alongside a message handed across to
       the page, trying to force a specific outcome regardless of what
       actually woke up. This fires once, and its only job is to give
       the page the same real reload the cold path already relies on;
       whatever runs afterward is entirely the page's own routine,
       exactly as it is for a fresh launch. */
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
