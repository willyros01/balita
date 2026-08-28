# HANDOFF — read this first

A future session has no memory of how this was built. This file is the
memory. Keep it in the repository and in every zip.

---

## What this is

**Wire** — a small web app that reads news feeds, strips out the
advertising, and presents the text at whatever size the reader needs. Built
for someone who finds ordinary news sites hard to read.

- **Repository:** `balita` (the original name; the app was renamed to Wire
  in 0.5.0, the repository was not, so the Pages address stays stable).
- **Hosting:** GitHub Pages, `https://<user>.github.io/balita/`
- **Owner is on an iPad and iPhone.** No computer, no command line, no
  editing files by hand. Everything happens through GitHub in Safari.
- **Files are flat.** No folders except `.github/workflows/`, because
  Safari cannot drag a folder into GitHub.

---

## How it works

Two halves that meet at one file.

**The fetcher** runs on GitHub's machines. It reads `sources.json`, pulls
each feed, opens the article pages, strips them down, and writes
`articles.json`.

**The app** is static. It reads `articles.json` and displays it. It never
fetches a feed itself — a browser cannot, and no page is ever inserted as
HTML, so nothing from a news site can carry a script to the reader.

`articles.json` is the contract. Its shape:

```
{ version, updated, sources: [{id, name}],
  articles: [{
    id, source, title, summary, byline, section, published, url,
    image: {src, caption} | null,
    blocks: [{type: "p"|"h"|"quote"|"list"|"image", ...}],
    truncated, source_of_text: "page"|"feed"|"summary", why
  }] }
```

`blocks` is the safety boundary. The reader draws only the types it knows;
anything else is dropped.

---

## Rules learned the hard way

**Never ship `articles.json` in a zip.** It overwrites real news with old
samples. Same for `feeds.yml` — the live copy lives in
`.github/workflows/` where a root upload cannot reach it, so a copy at the
root only misleads.

**Story ids are `sourceId-hash(url)`.** A story is tied to its source's id.
If a source's id in the app stops matching the id in `articles.json`, every
one of its stories silently disappears. This caused an entire evening of
confusion. Sources are now matched by address as well as id, and the app
warns when it holds stories for a source it does not have.

**GitHub's cron has never fired on this repository.** Not once across days.
Free-tier scheduled workflows are best-effort and get dropped. Do not
assume a schedule change fixed it — check for a run whose trigger says
*Scheduled*. `repository_dispatch` is wired up for an external scheduler;
see SETUP.md.

**Queued runs pin to their commit.** A run left waiting for two hours
executed with hours-old code and overwrote newer work. Concurrency now
cancels superseded runs.

**Feedback has to be visible.** Until 0.8.0 every message went into a
screen-reader-only element. Buttons appeared dead because their responses
were invisible. Use `toast()` from `ui.js`, never a hidden live region
alone.

**Never build a button that arms and disarms on a timer.** The old restore
control armed on first tap and disarmed after five seconds; tapping it
repeatedly toggled it forever and it could never fire. Ask a real question
with two buttons — `confirm()` in `ui.js`.

**Verify uploads landed.** The iPad file picker silently drops files from
large batches. It has happened twice. The fetcher prints its version as the
first line of the log for exactly this reason.

---

## Outlets

Working: Inquirer, Philstar, ABS-CBN, Rappler, GMA, Manila Bulletin, BBC,
CBC, CNN.

**ABS-CBN** is listed as a home page, not a feed — discovery finds
`abs-cbn.com/feed`. It moved off `news.abs-cbn.com` and the old address is
dead.

**Inquirer's 403s were self-inflicted** (fixed in 0.9.0). The fetcher
announced itself as `Wire/0.6` and allowed only 250ms between requests to
one host — twenty article pages in five seconds. Inquirer's rate limiter
refused about two thirds of them. It now identifies as a browser, waits
1.8s between requests to the same outlet, and retries a 403 once after a
pause. Note the pacing had a race: measuring the gap and then sleeping lets
every parallel worker fire at once, so the slot is reserved before sleeping.

**Inquirer is the problem child.** Roughly two thirds of its article pages
refuse the fetcher, so those stories fall back to headline and summary.
Their `fullfeed` also carries several real paragraphs and then stops, which
defeats any word-count test — hence `looksCut` in `extract.mjs`. The log
names the reason under *Why stories fell back to the summary*; that is the
number to work from.

Nothing was ever actually blocking the fetcher. The outlets that looked
blocked were timing out inside slow feed discovery.

**CNN was dropped.** `rss.cnn.com` still answers and is genuinely CNN's,
but its newest item is April 2023 — abandoned, not hijacked. No verified
current address exists, and CNN blocks automated access, so one cannot be
tested from here.

**GMA's main news feed stopped updating on 8 August.** Their Nation feed on
the same server is current to the minute. Their other section feeds are
listed at gmanetwork.com/news/rss and are worth trying if Nation ever goes
the same way.

**Verify a feed before adding it.** Two of the nine were serving stale or
dead content while looking perfectly healthy in the log. Opening the
address in a browser and checking the dates takes ten seconds.

---

## The person

Reads at large text sizes; the scale in `config.js` tops out at 50px to
match iOS accessibility settings. Wants plain explanations, not jargon.
Values being told when something is uncertain over being given a confident
guess — several confident guesses in a row cost an evening and were
rightly called out. If a diagnosis needs a fact, ask for the one fact.

---

## Version history

| | |
|---|---|
| 0.1.x | Shell, reading controls, storage |
| 0.2.x | Feed list, reader, sources screen, About panel |
| 0.3.0 | The fetcher and the scheduled job |
| 0.4.0 | Text to 50px; round-robin queue so late sources are not starved; 8 minutes down to 90 seconds |
| 0.5.0 | Renamed to Wire; icon; blocked stories explain themselves |
| 0.6.0 | Advertising interruptions filtered; runs exit instead of idling six minutes |
| 0.7.0 | Source list merged rather than overwritten; `sources.json` no longer cached as shell |
| 0.8.0 | Visible feedback; real confirm dialogs; sources matched by address; caps removed; external trigger |
| 0.8.2 | Feed entries found wherever a publisher puts them; CNN dropped as abandoned; GMA moved to its live Nation feed; The Guardian added |
| 0.9.0 | Browser user-agent and proper per-host pacing, fixing Inquirer's 403s; Inquirer news and global sections added |

---

## The newsinfo attempt (0.9.1)

All four ideas below were implemented. If newsinfo still returns 403 after
this, it is refusing GitHub's address range rather than the request's shape,
and no amount of header work will change that — take option 4 and keep it as
headline-and-summary.

- A `referer` naming the article's own section page.
- 6 seconds between requests to that host alone, via `HOST_GAP` in
  `net.mjs`. Other hosts stay at 1.8s.
- A warm-up visit to the host's front page, with cookies kept for the run
  and sent on the article requests.
- Browser headers, from 0.9.0.

## Original notes on the task

**Get `newsinfo.inquirer.net` readable.** It is the feed the owner actually
cares about, and the one currently returning HTTP 403 on all forty article
pages.

Context that narrows it down:

- `globalnation.inquirer.net` fetched 40 of 40 in the same run, with the
  same code, headers and pacing. So this is not the fetcher's behaviour in
  general — it is that host specifically.
- `www.inquirer.net/fullfeed` appears to have stopped updating: several
  consecutive runs report "20 in feed, 20 already had, 0 to fetch". Treat
  it as stale, the way GMA's main news feed was. It is probably not worth
  keeping once newsinfo works.
- The browser user-agent and 1.8s pacing added in 0.9.0 fixed Inquirer's
  403s everywhere except this host, so whatever newsinfo runs is stricter
  than a plain rate limiter.

Worth trying, roughly in order of cost:

1. A `referer` header pointing at the article's own section page. Some
   filters reject requests that arrive with no referrer at all.
2. Much slower pacing for that host alone — five or six seconds. Costs
   several minutes a run, so make it per-host rather than global.
3. A session cookie: fetch `newsinfo.inquirer.net` once, keep whatever
   cookie comes back, and send it with the article requests. Many filters
   admit anything that looks like it arrived via the site.
4. If none of that works, the feed's own descriptions run to about sixty
   words with a photograph, which is a usable headline-and-summary card.
   Keep it on those terms and say so in the app rather than pretending.

## Still open

- **`newsinfo.inquirer.net` returns 403 on every article page.** See above.
- **"Cut short" is over-reported** — 156 of 326 in the last run. The
  detector in `extract.mjs` flags any story whose final paragraph does not
  end in terminal punctuation, and plenty of real articles end on a name or
  a quotation. That puts a warning panel on complete stories.
- **The Guardian** (addressed in 0.9.2). `readFeed` caught the XML parser's
  error, discarded it, and returned immediately — so the recursive entry
  finder added in 0.8.2 never ran, and the log reported "parsed but held no
  items" when parsing had failed outright. Three wrong diagnoses came from
  believing that message. The error is now surfaced, and a pattern-matching
  reader recovers items from feeds the strict parser rejects.

  **The lesson worth keeping: never swallow an error.** An empty catch
  block cost more time here than every other bug combined.
- **Scheduling.** Needs an external service; GitHub's own has never worked.
- **Firebase is not configured.** `config.js` has `FIREBASE = null`, so
  settings live on each device separately. Optional.
- **Re-extraction.** Improving the extractor does not improve stories
  already collected, because they are reused rather than re-fetched. There
  is no way to force a rebuild short of deleting `articles.json`.
