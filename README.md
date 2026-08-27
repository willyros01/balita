# Balita

Philippine and world news, stripped of advertising and set for easy reading.

A small web app that installs to a phone, tablet or computer home screen.
No account, no password. Text size, high contrast and day/night are always
one tap away, never buried in a menu.

## Version

**0.1.1** — the shell. Header, reading controls, styling, storage and
offline support.

Every file sits at the top level, with no folders. That is deliberate: it
makes uploading from an iPad or phone possible, since mobile browsers
cannot drag a folder into GitHub.

At this version the page loads with an empty body. That is expected:
`app.js` has not been written yet.

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

Still to come:

| File | Version |
|---|---|
| `app.js`, `feed.js`, `reader.js`, `sources.js` | 0.2.0 |
| `articles.json`, `fetch-feeds.js`, the scheduled job | 0.3.0 |

## Setting it up

See `SETUP.md`. In short: create a repo named `balita`, upload every file,
then turn on Pages under Settings.

Firebase is optional. Without it the app keeps your sources and settings on
the device it is running on. With it, they follow you between devices.

## Licence

Yours. Do as you like with it.
