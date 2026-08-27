# Balita

Philippine and world news, stripped of advertising and set for easy reading.

A small web app that installs to a phone, tablet or computer home screen.
No account, no password. Text size, high contrast and day/night are always
one tap away, never buried in a menu.

## Version

**0.4.0** — fixes from the first live run.

- **Text goes much bigger.** Seven steps now, topping out at 50px to match
  the largest iOS accessibility setting. At the big sizes the layout gives
  back its margins and drops the thumbnails, because at 50px a phone fits
  about six words to a line and every pixel spent on a picture is a word
  lost.
- **Sources at the end of the list no longer starve.** The fetch queue used
  to be drained source by source, so when the budget ran out the last
  outlets in `sources.json` got nothing at all. It now takes one story from
  each source in turn.
- **Eight minutes down to about ninety seconds.** Article pages get one
  attempt at eight seconds instead of three attempts at fifteen, eight at a
  time instead of three. Most of that run was spent waiting on pages that
  were never going to answer.
- **Fewer blank stories.** Readability's own pre-check was refusing honest
  articles; it is gone, and the extractor simply tries.
- **Inquirer's cut-off stories.** A feed body is no longer trusted just
  because it is long. If it ends mid-sentence, on an ellipsis, or on a
  "read more" tag, the page is fetched and whichever version is longer
  wins.
- **The log says what actually happened**, per source, including which
  stories came from the page, the feed, or nothing at all.
- ABS-CBN and CBC addresses corrected. The schedule moved off :00 and :30,
  which free-tier jobs rarely get. Node deprecation warning fixed.

The version number lives in `config.js`. Bump `VERSION` and `BUILD_DATE`
there whenever you change anything, and bump `VERSION` in `sw.js` too —
that second one is what makes phones let go of the old copy.

Every file sits at the top level, with no folders. That is deliberate: it
makes uploading from an iPad or phone possible, since mobile browsers
cannot drag a folder into GitHub.

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
