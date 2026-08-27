# Setting up Balita

Written for doing it entirely on an iPad, in Safari. No computer needed,
nothing to install. About ten minutes.

Every file in this version sits at the top level, with no folders. That is
what makes this possible on a tablet — Safari cannot drag a folder into
GitHub, but it can select a batch of loose files.

---

## Part 1 — Unzip

1. Open the **Files** app.
2. Find `balita-v0.1.1.zip`, probably in **Downloads**.
3. Tap it once. A folder called `balita-v0.1.1` appears beside it.
4. Tap into that folder. You should see ten files and no folders.

---

## Part 2 — Create the repository

1. Go to **github.com** in Safari and sign in.
2. Top right, tap the **+**, then **New repository**.
3. **Repository name:** `balita`
4. **Description:** *News, plainly* — or leave it empty.
5. Choose **Public**.

   Pages is free on public repos. Private repos need a paid plan for it.
   There is nothing secret in this code.

6. Leave **Add a README** unticked — there is one in the zip.
7. Tap **Create repository**.

---

## Part 3 — Upload everything at once

1. On the page that appears, tap **uploading an existing file**.
   (If you have navigated away: **Add file** → **Upload files**.)
2. Tap **choose your files**.
3. The Files picker opens. Navigate to the `balita-v0.1.1` folder.
4. Tap **Select** at the top right.
5. Tap each of the ten files, or use **Select All** if it is offered.
6. Tap **Open**.

Wait for the list to finish loading. You should count ten:

```
README.md
SETUP.md
app.css
config.js
display.js
index.html
manifest.webmanifest
store.js
sw.js
tokens.css
```

7. In the box at the bottom, type: `Version 0.1.1`
8. Tap **Commit changes**.

If you end up short a file, just upload the missing ones the same way.
Repeating an upload does no harm.

---

## Part 4 — Switch on GitHub Pages

1. Tap **Settings** along the top of the repo. On a narrow screen it may be
   behind a **⋯** menu.
2. In the sidebar, tap **Pages**.
3. Under **Source**, choose **Deploy from a branch**.
4. Under **Branch**, choose **main**, folder **/ (root)**.
5. Tap **Save**.

Wait two or three minutes, then reload. A green banner appears with your
address:

```
https://YOUR-USERNAME.github.io/balita/
```

That link is the app.

---

## Part 5 — Check it worked

Open the address.

**What you should see at 0.1.1:** the header bar reading *Balita — News,
plainly*, with four buttons at the right: `A−`, `A+`, `◐`, `☾`. Below that,
nothing at all.

**Blank is correct.** The part that draws the stories arrives in 0.2.0.
What you are checking now is that the styling loaded and the buttons work.

Try them:

- `A+` and `A−` — the wordmark grows and shrinks.
- `◐` — everything snaps to pure black on white.
- `☾` — the page goes dark, and the moon becomes a sun.

If you see plain unstyled text with no header bar, `tokens.css` or
`app.css` did not upload. Go back to Part 3 and add them.

---

## Part 6 — Put it on your home screen

In Safari, tap the share button (the square with an arrow), scroll down,
tap **Add to Home Screen**.

It then opens like any other app, with no browser bar around it.

On Android: Chrome menu → **Install app**.
On a computer: look for a small install icon in the address bar.

---

## Uploading later versions

Exactly the same as Part 3. GitHub will ask about files that already exist;
let it replace them.

**One exception: `config.js`.** That is the file you personalise — your
Firebase keys and your starting list of feeds. Each new zip carries a fresh
copy that would overwrite yours.

Before uploading a new version: open `config.js` on GitHub, tap the pencil
icon, select all, and copy it into a note. Upload the new version, then
paste your copy back in and commit.

Once you have added feeds through the app's own Sources screen this matters
less, since those live in storage rather than in the file.

---

## If something looks wrong

| What you see | What to do |
|---|---|
| Plain text, no styling | The two `.css` files are missing. Redo Part 3. |
| 404 page not found | Pages is still building, or the branch is wrong. Wait, then recheck Part 4. |
| The old version after an upload | In Safari: Settings → Safari → Clear History and Website Data. |
| Still old on the home screen | Delete the icon, then add it again. |
| Completely white, no header | Open the address in a desktop browser and check the console — it will name the missing file. |

---

## What comes next

**0.2.0** adds `app.js`, `feed.js`, `reader.js` and `sources.js` — the
story list, the reading view and the screen for adding feeds. The app
becomes usable, running on sample stories.

**0.3.0** adds the fetcher and the scheduled job, so real headlines start
arriving on their own.
