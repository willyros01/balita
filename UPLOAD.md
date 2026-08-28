# UPLOAD — what to do with a new build

The same four steps every time. About three minutes.

---

## 1. Unzip

Files app → find `wire-vX.Y.Z.zip` in Downloads → tap it once → tap into
the folder that appears. Loose files, no folders inside.

## 2. Upload to GitHub

1. Open the **balita** repository.
2. **Add file** → **Upload files**.
3. **choose your files** → navigate into the unzipped folder.
4. **Select** (top right) → select every file → **Open**.
5. Commit message: the version number, e.g. `Version 0.9.3`.
6. **Commit changes**.

**Count the files on the confirmation screen before committing.** The iPad
picker silently drops files from large batches — it has happened twice, and
both times cost an evening chasing a bug that did not exist. If the count
looks short, cancel and drag again.

`articles.json` is never in a zip, so your stories are safe.

## 3. Run the fetch

**Actions** → **Fetch news** → **Run workflow** → **Run workflow**.

If the build changed `sources.json`, a run starts by itself when you commit
— check the Actions tab first and skip this step if one is already going.

Two to three minutes. It ends green.

## 4. Check the app

Open Wire, pull down to refresh.

If it still looks like the old version: delete the icon from your home
screen and add it again. iOS holds onto installed web apps.

---

## When `feeds.yml` changes

Only when told. A root upload cannot reach it, because the live copy lives
inside `.github/workflows/`.

1. In the repository, tap into **.github** → **workflows** → **feeds.yml**.
2. Tap the pencil.
3. Select all, delete, paste the new contents.
4. **Commit changes**.

Then delete any stray `feeds.yml` sitting in the repository root — it does
nothing there and only causes confusion later.

---

## Reading the log

**Actions** → the run → expand **Fetch the news**.

Long, and mostly noise from the page parser. Use the **Search logs** box:

| Type this | To see |
|---|---|
| `Per source` | how many stories each outlet actually produced |
| `Why stories` | the reason any fell back to a summary |
| `Wrote` | the final totals |

The first line names the fetcher version. If it is not the one just
uploaded, the upload did not land — go back to step 2.

---

## If something looks wrong

| What you see | What it means |
|---|---|
| A wall of red stack traces | Page parser noise. Harmless. Check the step icon: green tick means it finished. |
| A source showing no stories | Open **+ Sources** — it will say "No stories yet" beside it, or show a count. |
| Everything stale | Nothing has fetched. Check the Actions tab for a recent run. |
| The app looks unchanged | Delete the home screen icon and add it again. |

**Sources → Restore the standard list** puts everything back the way the
fetcher expects. Use it whenever the source list looks wrong.
