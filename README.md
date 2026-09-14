# Wire

News from anywhere, stripped of advertising and set for easy reading.

A small web app that installs to a phone, tablet or computer home screen.
No account, no password. Text size, high contrast and day/night are always
one tap away, never buried in a menu.

## Version

**0.17.12**

- Optional breaking-news notifications, switched on separately on each
  device and backed by Firebase Cloud Messaging.
- Tapping a notification opens its story whether Wire is already open or is
  being launched from a closed state on iPhone or iPad.
- A notification destination is saved before a suspended app is resumed, then
  removed only after Wire opens that exact story. This prevents iOS from losing
  a one-time background message and returning to the feed position.
- Notification taps use the same browser-owned launch route whether Wire is
  closed or suspended. Persistent cache recovery, URL routing, a window-focus
  listener, and repeated worker messages remain independent fallbacks.
- Fetched stories are published before their alerts are sent. If the hosted
  feed is briefly behind, Wire retains the destination and retries instead of
  dropping the reader back on All Sources.
- Every current story is also published at `articles/<article-id>.json`.
  Notification taps retrieve that exact endpoint, open the ID directly, and
  make Back return to the matching headline in its publisher grouping.
- Background-resume routing no longer depends on iOS emitting a lifecycle
  event. The worker broadcasts before and after foregrounding every Wire
  window, while the page consumes the durable route on a one-second heartbeat.
- All three Inquirer feeds use the Cloudflare doorway as their primary route.
  Their direct feeds are checked only for freshness; a newer direct index can
  supply article URLs, but supported Inquirer article pages still go through
  Cloudflare for full-text extraction.
- Inquirer records that fell back to summaries after a temporary page refusal
  are never considered complete. Each 30-minute run retries them until their
  full article text is recovered.
- Manila Bulletin remains direct-only while a working full-article source is
  investigated; its Cloudflare challenge is not treated as a usable feed.
- Alerts are accepted only from the three Inquirer feeds, CBC, BBC, GMA, DW,
  and ABS-CBN, and only when the publisher begins its headline with Breaking,
  Just In, Urgent, or Live.
- Hard controls allow no more than one alert in any rolling 30-minute period
  and one alert per article. Suppressed alerts never queue.
- Notifications use normal Web Push priority and leave Focus and Do Not
  Disturb under the device's control.
- GitHub authenticates to Google Cloud with a short-lived identity. No
  permanent service-account key is stored.
- `NOTIFICATIONS.md`, `DOORWAY.md`, and `SCHEDULE.md` document the complete
  external service interfaces and recovery controls.


## What each file does

| File | What it is for |
|---|---|
| `index.html` | The page shell |
| `manifest.webmanifest` | Lets it install to the home screen |
| `sw.js` | Offline caching and updates |
| `tokens.css` | Every colour and size, all three modes |
| `app.css` | Layout and components |
| `config.js` | **The only file you edit** — keys and feed list |
| `store.js` | Firestore, with device-only fallback |
| `display.js` | Text size, contrast, day and night |
| `notifications.js` | Per-device notification permission and registration |

| `app.js` | Wiring — loads everything, holds the shared state |
| `feed.js` | The story list and the source chips |
| `reader.js` | One story, decluttered |
| `sources.js` | Adding and removing feeds |
| `articles.json` | The stories. Written by the fetcher |
| `sources.json` | The feed list. Read by both the app and the fetcher |

The fetcher — runs on GitHub, never in the browser:

| File | What it is for |
|---|---|
| `fetch-feeds.mjs` | The run: read feeds, decide what is new, write the file |
| `extract.mjs` | Strips a news page down to blocks of text and pictures |
| `discover.mjs` | Finds a feed address from a home page |
| `net.mjs` | Outbound requests: timeouts, retries, and a polite gap |
| `package.json` | The three libraries the fetcher needs |
| `.github/workflows/feeds.yml` | The schedule |
| `breaking-notify.mjs` | Strict alert gate, quotas, subscription reader and FCM sender |
| `breaking-state.json` | Seen-story deduplication and rolling alert quota state |
| `NOTIFICATIONS.md` | Firebase, FCM and GitHub identity interface documentation |
| `firestore.rules` | Canonical device-subscription security rules |
| `DOORWAY.md` | Cloudflare doorway interface and setup |
| `SCHEDULE.md` | cron-job.org request interface and setup |

## How the fetcher works

Every half hour, on GitHub's machines:

1. Read `sources.json`.
2. Fetch each feed. If an address turns out to be a home page rather than a
   feed, look for the feed and use that instead.
3. Compare against the `articles.json` already committed. Stories already
   there are left alone — a normal run opens a handful of pages, not
   hundreds.
4. For genuinely new stories: if the feed carried the full text, use it. If
   not, open the article page and run it through Readability, the same
   engine behind Firefox's Reader View.
5. Keep only paragraphs, headings, quotes, lists and the story's own
   pictures. Everything else is discarded.
6. Write `articles.json` and commit it.

Nothing from a news site is ever passed through as HTML. Each block is
plain text or a picture address, so no script or tracker can reach the
phone.

Run it yourself with `npm install` then `npm run fetch`.

## Setting it up

See `SETUP.md`. In short: create a repo named `balita`, upload every file,
then turn on Pages under Settings.

Reading settings and sources remain on each device. Firebase is used only
when that device explicitly turns on breaking-news notifications.

## Licence

Yours. Do as you like with it.
