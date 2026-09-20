# Wire

News from anywhere, stripped of advertising and set for easy reading.

A small web app that installs to a phone, tablet or computer home screen.
No account, no password. Text size, high contrast and day/night are always
one tap away, never buried in a menu.

## Version

**0.17.26**

- Optional breaking-news notifications, switched on separately on each
  device and backed by Firebase Cloud Messaging.
- A notification destination is saved before iOS resumes Wire. The service
  worker only foregrounds the app; the visible page then opens the exact ID.
- A saved notification route expires 30 minutes after the alert was sent. Wire
  clears an expired route, explains that it expired, and shows current
  headlines, so an old alert cannot block a newer one.
- Articles older than three days are removed even when a publisher's feed is
  frozen or temporarily unreachable. Their per-article JSON endpoints are
  removed in the same feed publication.
- Headline-only records are removed 24 hours after Wire first sees them. Full
  articles retain the normal three-day window.
- Fetched stories are published before their alerts are sent. If the hosted
  feed is briefly behind, Wire retains the destination and retries instead of
  dropping the reader back on All Sources.
- Every current story is also published at `articles/<article-id>.json`.
  Notification taps retrieve that exact endpoint, open the ID directly, and
  make Back return to the matching headline in its publisher grouping.
- Background-resume routing waits until Wire is visible. Startup, focus,
  `pageshow`, visibility return, and a visible-only heartbeat consume the
  durable route without asking a frozen background page to navigate.
- All three Inquirer feeds use the Cloudflare doorway as their primary route.
  Each direct feed is checked for freshness and becomes the discovery fallback
  when the doorway is unavailable or older. Supported Inquirer article hosts
  use the doorway first and retain a direct-page fallback.
- Every retained headline-only record is queued for one paced recovery attempt
  in the same workflow pass. ABS-CBN is the sole exception because its pages
  have no server-rendered article body.
- Article recovery follows one bounded ladder: complete feed text, the
  configured doorway for supported Inquirer hosts, the direct article page,
  then the best feed text or summary already saved. No speculative mobile,
  cache, AMP, or API URL is invented.
- Direct and doorway requests have separate circuit breakers. Two HTTP 403
  responses stop that route for the remainder of the run while still allowing
  the other route to recover the article. A successful response resets it.
- Previously saved full text is never replaced by a shorter feed copy or
  headline-only result.
- Manila Bulletin remains direct-only. Its RSS URL returns the same Cloudflare
  challenge both directly and through the Worker; an allowlist entry permits
  a request but cannot make the upstream site accept it.
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
| `retention.mjs` | The tested three-day article-retention rule |
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
