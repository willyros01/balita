# Wire

News from anywhere, stripped of advertising and set for easy reading.

A small web app that installs to a phone, tablet or computer home screen.
No account, no password. Text size, high contrast and day/night are always
one tap away, never buried in a menu.

## Version

**0.8.0**

- **Feedback is visible.** Every message the app produced went into a
  hidden element meant for screen readers and was never shown. Buttons
  looked dead because their responses were invisible. There is now a toast.
- **Real confirm dialogs.** The remove and restore controls armed on the
  first tap and disarmed five seconds later, so tapping repeatedly toggled
  them forever and they could never fire. Both now ask a question with two
  buttons, and Restore looks like a button rather than a line of text.
- **Sources matched by address as well as id.** An outlet saved under a
  generated id was never recognised as the one its stories belonged to, so
  it showed as switched on with nothing behind it. Ids are corrected and
  duplicates collapsed on load.
- **The caps are gone.** No fifteen-per-source, no five-day cutoff — both
  were numbers picked out of the air, and between them they binned about
  thirty stories a run. A story now leaves only when its outlet stops
  listing it.
- **The Sources screen tells the truth:** a story count beside each outlet,
  "No stories yet" where there are none, and a warning when the app holds
  stories for a source missing from the list. About shows displayed against
  loaded.
- **An external scheduler can trigger a run.** GitHub's cron has never
  fired here; SETUP.md covers wiring up one that keeps time.
- **Superseded runs are cancelled** rather than queued. One left waiting
  ran two hours later with stale code and undid newer work.
- **The fetcher prints its version first**, so which code ran is never
  again a matter of deduction.
- **HANDOFF.md** carries the project's memory for a future session.


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

Firebase is optional. Without it the app keeps your sources and settings on
the device it is running on. With it, they follow you between devices.

## Licence

Yours. Do as you like with it.
