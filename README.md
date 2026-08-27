# Balita

Philippine and world news, stripped of advertising and set for easy reading.

A small web app that installs to a phone, tablet or computer home screen.
No account, no password. Text size, high contrast and day/night are always
one tap away, never buried in a menu.

## Version

**0.2.1** — the app works. Story list, reading view, the screen for adding
feeds, and an About panel at the bottom of the list showing what is running
and when it last fetched. Running on sample stories until 0.3.0.

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
| `articles.json` | The stories. Sample data for now |

Still to come:

| File | Version |
|---|---|
| `fetch-feeds.js` and the scheduled job | 0.3.0 |

## Setting it up

See `SETUP.md`. In short: create a repo named `balita`, upload every file,
then turn on Pages under Settings.

Firebase is optional. Without it the app keeps your sources and settings on
the device it is running on. With it, they follow you between devices.

## Licence

Yours. Do as you like with it.
