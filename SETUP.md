# Setting up Wire

Written for doing it entirely on an iPad, in Safari. No computer needed,
nothing to install. About ten minutes.

Every file in this version sits at the top level, with no folders. That is
what makes this possible on a tablet — Safari cannot drag a folder into
GitHub, but it can select a batch of loose files.

---

## Upgrading to 0.8.0 — read this first

**`feeds.yml` changed.** The root upload cannot reach the live copy. Open
`.github/workflows/feeds.yml` on GitHub, tap the pencil, select all, and
paste in the new version from the `feeds` card. Commit.

**Everything else is a normal upload.** `articles.json` is not in the zip,
so there is nothing to leave out.

**Your source list repairs itself on first load.** GMA and CNN were stored
under generated ids that no story carried, which is why they showed as On
with nothing behind them. The app now matches on address as well, adopts the
correct id, and removes duplicates. No action needed.

---

## Upgrading — general

Two things differ from previous versions.

**Do not upload `articles.json`.** The copy in the zip is old sample data,
and your repository already has the real one the fetcher wrote. Uploading it
would put placeholder stories back until the next run. When the Files picker
opens, tap every file *except* that one.

**The repository keeps its name.** Only the app is called Wire. Leaving the
repository as `balita` means your Pages address does not change.

**`feeds.yml` is not in this zip.** The schedule has not changed, and the
live copy lives at `.github/workflows/feeds.yml` where a root upload cannot
reach it anyway. If a stray `feeds.yml` is sitting in your repository root
from an earlier version, delete it — it does nothing there.

---

## Part 1 — Unzip

1. Open the **Files** app.
2. Find `wire-v0.8.0.zip`, probably in **Downloads**.
3. Tap it once. A folder called `balita-v0.2.0` appears beside it.
4. Tap into that folder. You should see twenty-three files and no folders.

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
3. The Files picker opens. Navigate to the `balita-v0.2.0` folder.
4. Tap **Select** at the top right.
5. Tap each of the ten files, or use **Select All** if it is offered.
6. Tap **Open**.

Wait for the list to finish loading. You should count twenty-one:

```
README.md          feed.js            net.mjs
SETUP.md           feeds.yml          package.json
app.css            fetch-feeds.mjs    reader.js
app.js             index.html         sources.js
articles.json      manifest.webmanifest  sources.json
config.js          extract.mjs        store.js
discover.mjs       display.js         sw.js
tokens.css
```

7. In the box at the bottom, type: `Version 0.8.0`
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

**What you should see at 0.8.0:** the header bar, a row of source chips
below it, and eight stories. Scroll to the bottom for **About this app** —
version, release date, how many stories are loaded, when they were fetched,
how many sources are on, where your settings are kept, and whether you are
online. Tap one to read it. Tap **+ Sources** at the
end of the chip row to add or remove feeds.

The stories are samples with placeholder text. Real ones start arriving in
0.3.0.

Things to try:

- `A+` — press it seven times to reach the largest size. Past the fourth
  step the margins narrow and the thumbnails disappear, so the words get
  the whole screen.
- `A−` — back down again.
- `◐` — pure black on white, and the source colours drop away so the
  letter tags carry the meaning instead.
- `☾` — night mode.
- Tap a chip to show one source only.
- Tap **+ Sources**, switch something off, go back — it is gone from the
  list. Switch it back on and it returns.

Your settings and your feed list are remembered between visits.

| Problem | Cause |
|---|---|
| Plain text, no header bar | The two `.css` files are missing |
| Header but no stories | `articles.json` is missing |
| Action fails at the last step | Part 5c was skipped |
| Action runs but nothing changes | Normal — nothing new since last time |
| One outlet always skipped | Its feed address moved; fix `sources.json` |
| A source shows a chip but no stories | It is not in `sources.json` — the app list and the fetcher list are separate |
| No About panel at the bottom | `app.js` did not update — upload it again |
| Header, then nothing | One of the `.js` files is missing |

In each case, redo Part 3 with the missing file.


---

## Part 5b — Put the schedule in place

This is the one file that has to go in a folder, because GitHub insists on
it. You will type the folder name rather than dragging it, which works fine
on an iPad.

1. In your repo, tap **Add file** → **Create new file**.
2. In the filename box at the top, type exactly:

   ```
   .github/workflows/feeds.yml
   ```

   Include the leading dot. As you type each slash, GitHub shows the folders
   forming above the box.

3. Open `feeds.yml` from the unzipped folder — tap and hold it in Files,
   choose **Quick Look**, then select all the text and copy it.

   If Quick Look will not let you copy, open the `feeds.yml` card in the
   chat where I sent this version and copy from there instead.

4. Paste it into the big box on GitHub.
5. Scroll down, commit message `Add the schedule`, tap **Commit changes**.

Now delete the loose copy: open `feeds.yml` in the repo root, tap the **⋯**
menu, choose **Delete file**, and commit. It only works inside
`.github/workflows/`, and leaving a stray copy at the root is confusing
later.

---

## Part 5c — Let the job write to the repo

The fetcher has to commit the file it produces, and GitHub blocks that by
default.

1. Tap **Settings** in your repo.
2. In the sidebar: **Actions** → **General**.
3. Scroll to **Workflow permissions**.
4. Choose **Read and write permissions**.
5. Tap **Save**.

Miss this and every run fails at the last step with a permissions error.

---

## Part 5d — Run it once by hand

Do not wait half an hour to find out whether it works.

1. Tap **Actions** along the top of the repo.
2. If you see a green button offering to enable workflows, tap it.
3. In the sidebar, tap **Fetch news**.
4. Tap **Run workflow** → **Run workflow**.

It takes two to four minutes. Tap into the run and then into **fetch** to
watch it. What you want to see:

```
Reading 9 feeds

  Inquirer           20 in feed,  0 already had, 15 to fetch
  Philstar           10 in feed,  0 already had, 10 to fetch
  ...

Fetching 80 stories

Per source, after fetching:
  Inquirer           15 stories  (page 13, feed 2, summary only 0, reused 0)
  Philstar           10 stories  (page 8, feed 0, summary only 2, reused 0)
  ...
  fetching took 94s

Wrote 78 stories to articles.json
  full text     71
  with photo    64
  cut short      4
  summary only   3
  took          102s
```

Read the **Per source** block rather than the one above it. The first block
says what was queued; only the second says what was actually retrieved. A
source showing `summary only` for most of its stories is refusing the
fetcher — worth telling me about.

A line reading *skipped* beside one outlet is not a failure. Feeds move and
break; the run keeps going with the others. If the same one is skipped
every time, its address has changed — find the new one and edit
`sources.json`.

Once it turns green, open the app. Real headlines, and the About panel now
shows a real **Fetched** time.

From here it runs itself, every half hour.


---

## Making it run on a schedule

GitHub's own scheduler has never fired on this repository — not once. Free
plans run scheduled jobs on spare capacity, and when there is none they are
skipped rather than delayed. The setting is still there and costs nothing,
but it cannot be relied on.

The fix is a service outside GitHub that keeps proper time and pokes the
workflow. About ten minutes, all in Safari, free.

### Part A — make a key

1. On GitHub, tap your picture (top right) → **Settings**.
2. Bottom of the sidebar: **Developer settings**.
3. **Personal access tokens** → **Fine-grained tokens** → **Generate new
   token**.
4. Fill in:
   - **Token name:** `wire-scheduler`
   - **Expiration:** 1 year
   - **Repository access:** *Only select repositories* → choose **balita**
   - **Permissions** → **Repository permissions** → find **Contents** and
     set it to **Read and write**
5. **Generate token**, then **copy it**. It is shown once and never again.
   Paste it somewhere safe for the next five minutes.

The key can only touch this one repository. If it ever leaks, delete it on
that same screen and make another.

### Part B — set up the schedule

1. Go to **cron-job.org** and make a free account.
2. **Create cronjob**.
3. **Title:** `Wire news`
4. **URL:**

   ```
   https://api.github.com/repos/YOUR-USERNAME/balita/dispatches
   ```

   Replace `YOUR-USERNAME`. The repository is `balita`, not `wire`.

5. **Schedule:** every 30 minutes. Avoid :00 and :30 if it offers a choice.
6. Open **Advanced**:
   - **Request method:** `POST`
   - **Request body:**

     ```
     {"event_type":"fetch-news"}
     ```

   - **Headers** — add three:

     | Key | Value |
     |---|---|
     | `Accept` | `application/vnd.github+json` |
     | `Authorization` | `Bearer YOUR-TOKEN-HERE` |
     | `Content-Type` | `application/json` |

7. **Create**, then use **Test run**.

A green result, or a **204**, means it worked. Check the Actions tab: a run
should appear within seconds, triggered by `repository_dispatch`.

**401** means the token is wrong or was pasted without `Bearer ` in front.
**404** usually means the username or repository name is misspelled — and
note that GitHub returns 404 rather than 403 when a token lacks permission,
so check Part A step 4 as well.

From then on it runs itself, and the **Fetched** line in the app's About
panel should never be more than about half an hour old.

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

The app is finished and running on its own.

Things you may want next, in rough order of usefulness:

- **Saving stories to read later.** Needs Firebase to be worth it, so they
  follow you between devices.
- **Reading aloud.** Every browser has a speech engine built in; it is a
  button and about forty lines.
- **Search across everything fetched.**
- **A wider net.** Add any outlet with a feed from the Sources screen, or
  by editing `sources.json`.

## Adding and changing feeds

Two ways, and they do different things.

**From the app** — tap **+ Sources**. This changes what *you* see. It does
not tell the fetcher to start pulling that feed.

**In `sources.json`** — this is the fetcher's list. Open the file on
GitHub, tap the pencil, add a line in the same shape as the others, commit.
The schedule notices the change and runs immediately rather than waiting.

To have a new outlet actually appear, it has to be in `sources.json`.

## Running less often

Half-hourly is roughly 1,400 runs a month, which is comfortably inside
GitHub's free allowance for a public repo. If you would rather it were
quieter, open `.github/workflows/feeds.yml` and change the cron line:

| Line | Meaning |
|---|---|
| `*/30 * * * *` | every 30 minutes |
| `0 * * * *` | on the hour |
| `0 */3 * * *` | every three hours |
| `0 22,2,10 * * *` | three times a day (times are UTC) |

Manila is UTC+8, so `0 22 * * *` fires at 6 AM local.
