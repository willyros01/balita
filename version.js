/* ============================================================
   version.js — the only place the version number lives.

   It used to sit in two files: VERSION in config.js and a cache
   name in sw.js. Change one and forget the other, and the phone
   keeps serving the old build while About reports the previous
   number — which looks exactly like a failed upload, and cost one
   round of confusion working out that it was not.

   Change the line below. Nothing else.
   ============================================================ */

export const VERSION    = "0.16.1";
export const BUILD_DATE = "2026-08-28";

/* The service worker reads this too, so the cache name can never
   drift from the version the app reports. */
export const CACHE_NAME = "wire-v" + VERSION;
