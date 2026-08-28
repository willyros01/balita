# Wire

News from anywhere, stripped of advertising and set for easy reading.

A small web app that installs to a phone, tablet or computer home screen.
No account, no password. Text size, high contrast and day/night are always
one tap away, never buried in a menu.

## Version

**0.7.0** — the source list, fixed properly.

- **A feed added to `sources.json` now reaches devices that have already
  run.** The saved list used to win outright, so CNN — switched on in the
  file — stayed invisible on any phone that had loaded before. The two are
  merged on every load: an outlet you have keeps your on/off choice but
  takes the current address, one you do not have is added, one you removed
  on purpose stays removed, and anything you added yourself is untouched.
- **`sources.json` is no longer cached like the shell.** It was being served
  cache-first, so a device never even asked for a newer copy. It is data,
  and now behaves like the stories do.
- **Removing a source asks first.** The cross sat against the on/off toggle
  and removed an outlet outright on one tap. It now asks, and gives you five
  seconds to change your mind before disarming.
- **Undo after a removal**, for as long as the Sources screen stays open.
- **"Restore the standard list"** at the bottom of that screen. Every outlet
  the fetcher works from, switched on — so the answer to a mess is never
  "go into Safari's settings and clear website data".

Includes 0.6.0: advertising interruptions filtered out, runs exiting when
the work is done rather than idling for six minutes, and the log naming why
a source fell back to summaries.


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
