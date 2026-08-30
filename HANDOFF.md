# HANDOFF — read this first

A future session has no memory of how this was built. This file is the
memory. Keep it in the repository and in every zip.

---

## Standing instruction for every build

Ship **one complete `wire-vX.Y.Z.zip`**, not a partial set of changed
files. Partial uploads have caused real confusion — twice a dropped file
led to hours chasing a bug that did not exist. The whole app is under
200kB; there is no reason to economise.

Always include **UPLOAD.md** in the zip. It is the step-by-step the owner
follows: unzip, upload everything, run the fetch, check the app. Say plainly
in the reply whether `feeds.yml` changed, since that one file lives in
`.github/workflows/` and a root upload cannot reach it.

Never put `articles.json` in a zip. It would overwrite real news.

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

## The Cloudflare doorway — prototype PASSED (28 Aug)

`/probe?url=https://newsinfo.inquirer.net/` from a Cloudflare Worker
returned **status 200, a real article page**, where GitHub's runners get 403.
The approach works.

Not yet wired in. What remains: set `WIRE_KEY` as a Worker secret, then add
to `net.mjs` a list of hosts to route through the doorway and a branch that
calls `/fetch?url=` with the key instead of fetching directly. Roughly ten
lines. Everything else — parsing, extraction, writing articles.json — stays
on GitHub exactly as it is. Do not move the extractor to Cloudflare; it
needs jsdom, which Workers cannot run.

`worker.js` is written, tested against lookalike domains, local files and
cloud metadata addresses, and restricted to an allowlist of news hosts.

## newsinfo: settled (0.9.3) — superseded by the doorway above

**It refuses GitHub's address range, not the shape of the request.** Every
idea below was tried together and newsinfo returned 403 on all 35 article
pages regardless — including at six seconds between requests.

Worse, the warm-up visit, referrer and session cookie *broke ABS-CBN*,
which had been fetching 100 of 100 from the page and dropped to 33 refusals.
All three were removed in 0.9.3. The browser user-agent and 1.8s pacing from
0.9.0 are the parts that helped and they stay.

newsinfo is now marked `feedOnly` in sources.json: the fetcher takes what
the feed gives and does not ask for the page. Its descriptions run to about
sixty words with a photograph, and the app labels these "Headline only" with
a button through to the original. Do not spend more time on this unless the
fetcher moves off GitHub's runners.

**The lesson: change one thing at a time.** Four changes shipped together
fixed nothing and broke something that worked.

### What was tried

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

## Fixed in 0.16.2 — the dead buttons, finally

Reported at 0.7.0 and unfixed for nine builds. Five explanations were
offered and every one was wrong: an invisible toast, a stale service
worker, horizontal overflow, `overflow-x: hidden` on the html element, a
covering element.

**The answer came from instrumenting rather than reasoning.** A touch
reporter added to the Sources screen showed the touch landing on exactly
the right button, with `touchstart` firing — and no click following. iOS
withholds a click when anything shifts under the finger between press and
release.

`onTap()` in `ui.js` binds `click` and `pointerup`, with a 400ms guard so
one press acts once. Applied to every control in the app. **Use it for
anything new** — `addEventListener("click", …)` alone works on a desktop
and is dead on a phone.

Two lessons worth more than the fix:

- **Checking that a file parses is not checking that it works.** The
  rewrite that introduced `onTap` deleted four imports from `sources.js`.
  `node --check` passed; the screen threw on first use. All ten modules are
  now actually loaded in a stub browser before shipping.
- **When five theories have failed, stop theorising.** The crash box and the
  touch reporter answered in one round what reasoning had not in nine.

The crash box stays: a throw while drawing the Sources screen now shows the
error rather than leaving a blank half-screen indistinguishable from broken
buttons.

## Fixed in 0.15.0

**DW capped at 25, and nothing else capped.** It publishes 139 stories a
day against 15 or 20 from most outlets, so it was two thirds of the list and
the Philippine papers scrolled away beneath it. Now about a quarter.

The cap is `max` on that one source in `sources.json`. Any source can set
one; none other does. **The blanket per-source cap was removed deliberately
in 0.8.0 and is not coming back** — it was throwing away thirty stories a
run from outlets that publish few. This is the opposite: a limit on the one
outlet that publishes many.

The log names it when a feed exceeds its own limit, so the number is never
silently doing something unexpected.

To change it, edit `max` in `sources.json`. To remove it, delete the line.

## Fixed in 0.14.3

- **The service worker could freeze the app on an old version.** It read
  its cache name from `version-sw.js` via `importScripts`. If that file
  failed to load the worker threw during install — and a worker that fails
  to install leaves the previous one serving the old app indefinitely. A fix
  could be uploaded and have no effect, with nothing to show why. The
  version is written out in `sw.js` now, and `cache.addAll` — all or nothing
  — was replaced with one file at a time.

  **Suspected cause of "the buttons are still dead" after 0.14.1.**

- **Sources controls lifted above anything that might cover them**, with
  `touch-action: manipulation` so iOS does not wait to see whether a tap is
  the start of a gesture. The About panel is hidden on that screen.
- **Day and night follow the real sun.** `sun.js` computes sunrise and
  sunset from latitude and longitude in `config.js` — no network, no
  permission prompt. Verified against Manila (05:44 / 18:10 on 29 August)
  and London (04:43 / 21:21 in June). Falls back to fixed hours inside the
  polar circles, where some days have neither.
- **A GitHub token reminder**, on the Sources screen, behind a passcode.
  The passcode is never in the code and never stored as text: only a salted
  SHA-256 hash, which cannot be reversed. It stops an accidental change, not
  a determined person with the device — say so rather than implying more.
- GMA's "Make this your preferred source" filtered.

## Fixed in 0.14.1

- **Every button on the Sources screen was dead on iPhone.** `.toast`
  declared `display: flex`, which beats the browser's own rule for the
  `hidden` attribute — so the toast never left the page. Invisible at zero
  opacity, and catching every tap that landed on it. On an iPad the buttons
  sat above it; on an iPhone they sat under it. Reported twice before it was
  found. `.toast[hidden] { display: none }` and `pointer-events: none`
  until shown.

  **Worth remembering: a class that sets `display` silently defeats
  `hidden`.** Anything toggled by that attribute needs the rule written out.

- **Delete is a word in a button**, well clear of the On/Off toggle.
- **The Guardian's entity limit** raised in the parser options. If the
  installed version does not know the option it is ignored and the
  pattern-matching reader carries on as before — either way nothing is lost,
  and the log now reports recovery as a success rather than an error.
- **Stale stories stay in the file** while they wait to be re-read, instead
  of being dropped. The list no longer thins from 517 to 250 during a
  changeover.

## Fixed in 0.14.0

- **Day and night follow the clock.** Three states on one button:
  automatic, day, night. Automatic switches at 6am and 6pm and rechecks
  when the app comes back into view. A deliberate choice is never
  overridden. A small dot on the button marks automatic.
- **The gutter was too tight.** 0.4.0 cut it to 0.55rem at the largest text
  sizes to win a character per line; on an iPhone that put the letters
  against the edge and they read as clipped. Never below 0.9rem now.
- **The design has more presence.** The source tag is filled with the
  outlet's colour rather than outlined, so the one visual idea the app has
  actually shows. A selected chip wears that colour too. The opening
  paragraph is slightly larger, the byline sits under a rule, captions take
  the source colour.
- **The opening picture no longer repeats.** Comparing filenames missed it,
  because outlets publish a wide crop above the story and a squarer one
  inside — different files. Any image before the first paragraph is dropped
  instead, which is structural and does not depend on proving two files hold
  the same photograph.
- DW's Google "preferred source" appeal and "Edited by:" filtered.

**EXTRACTOR_VERSION is now 5**, so the next run re-reads everything again.

## Fixed in 0.13.0 — the one that mattered most

**Improvements now reach stories already collected.** Until this build the
fetcher reused anything it already had, so a change to the extractor only
ever affected the handful of stories fetched afterwards. DW had 136 of 139
reused; the boundary fix touched three of them. Several fixes looked as
though they had failed when they had simply never run on the stories being
looked at.

`EXTRACTOR_VERSION` in `extract.mjs` is stamped onto every story as `fx`.
Anything carrying an older number is read again. **Bump it whenever the
extraction rules change** — a new filter, a new boundary, anything that
would produce different blocks from the same page. Expect one long run
afterwards while the backlog is re-read; the fetch budget spreads it over
two or three runs, and the log says how many are stale.

Also in 0.13.0:

- **The list no longer invents thumbnails.** A story without a picture used
  to show a fabricated one in the list and nothing in the article, so the
  two disagreed. Nothing in the app now draws a picture that does not exist.
- **Interface icons are not photographs.** Filtered by shape — small and
  roughly square — and by address (`icon`, `share`, `sprite`, `button`).
  Not by caption: that way lies a new word every week.
- **The lead picture no longer repeats** as the first body block. Whole-URL
  comparison missed it because outlets serve the same photograph at several
  sizes; the filename is compared instead.
- **DW's video furniture** filtered.

## Fixed in 0.12.0 — and why they needed fixing twice

**The DW cut was cancelled by another fix in the same build.** 0.11.0 added
a rule dropping any paragraph that is just a link, and a rule cutting the
article at DW's short link. The first removed the marker the second looked
for. Both were tested; neither was tested against the other. The boundary
is now noted before the junk filter runs.

**The invented photograph came from a fallback I only half removed.**
`figureFor` in `reader.js` had an `else` branch drawing a fake picture when
there was none. 0.10.0 stopped the *lead* image calling it, but every image
block inside the article still went through the same function. The branch is
gone entirely: no picture means no figure, and an image that fails to load
removes its own frame. `imageFrom` in `extract.mjs` also no longer emits a
block without an address.

**The lesson worth keeping.** Two fixes in one build can cancel each other,
and testing each alone will not show it. When several changes touch the same
pipeline, test the pipeline, not the pieces.

**And a standing diagnostic.** The log now prints, per source, how many
stories carry a picture. Twice I could not tell whether an image was lost in
the fetcher or in the app, and guessed wrong both times. `Guardian 45
stories … 0/45 with a photo` points at the fetcher; `45/45` points at the
app. No more guessing at that.

## Fixed in 0.11.0

- Inquirer's subscription messages, both the success and the failure
  notice nobody triggered, plus the comments disclaimer.
- Any paragraph whose whole text is a web address.
- DW's stories fusing together — their short link `p.dw.com/p/XXXX` marks
  the end of each item, so the article is cut there.
- Guardian and DW images: the loose reader now looks in media tags, in
  `<img>` inside the item HTML, and in escaped HTML inside a description.
- **The doorway is wired in.** See DOORWAY.md.

## Superseded: DW arrives as several stories glued together

Reported 28 Aug, from the first run with DW in the list. One screen showed
the tail of a Baltic Sea story, then a bare short link, then a completely
different headline — all inside one article.

Three separate faults:

**The article does not end.** DW's RDF feed evidently carries the following
items inside the same block, so `fromFeedContent` keeps going past the end
of the story. Find where one item stops and cut there; a reader cannot tell
which words belong to which story, which is worse than any amount of junk.

**A bare short link in the body** — `https://p.dw.com/p/5JaRt`. Drop any
paragraph whose entire text is a URL. General rule, not DW-specific: no
outlet means a naked address to be read as a sentence.

**No images, so the placeholder appears.** The lead-image fix in 0.10.0
removes the invented graphic when a story has none, so either that build was
not yet uploaded when this was seen, or DW stories are arriving with no
image at all. If the latter: DW is RDF like The Guardian was, and this is
probably the same fault — the picture is inside the item and the reader is
not passing it through. **Check the version in About before investigating.**

## Next build: ABS-CBN articles arriving empty — measured

A story showed only a clipboard icon and a "Story cut short" panel. Probed
through the Cloudflare Worker on 28 Aug:

```
target:  abs-cbn.com/news/nation/2026/8/26/water-leaks-inside-lrt-1...
status:  200      bytes: 295161      paragraphs: 2
verdict: answered, but the page holds almost no text
```

**Not a refusal.** Cloudflare received the whole page — 295KB of it — and
the article is not in there. ABS-CBN builds its stories in the browser after
the page arrives, so the fetcher receives a shell and so would the doorway.
**Routing ABS-CBN through Cloudflare would change nothing**, which is worth
knowing because it was the obvious first instinct.

### Settled in 0.13.1: feedOnly

The other sections were never probed, deliberately. The owner reads news,
not sports or entertainment, and nation — the section that matters — is
confirmed empty. Probing sections nobody reads to maybe rescue one of them
was not worth the owner's time.

ABS-CBN is now `feedOnly`. Its feed carries a headline, a summary and a
photograph, so it shows a proper headline card rather than a clipboard icon
above an empty panel. It also stops the fetcher opening a hundred pages a
run for nothing, which was most of the run time.

The reading view says why, in plain words: the site builds its stories in
the browser, so the page arrives without the article in it.

**If ABS-CBN ever rebuilds their site**, drop the `feedOnly` flag and probe
again. Nothing else needs changing.

## Next build: interface icons arriving as photographs

ABS-CBN, on 0.12.0: a full-screen grey copy-to-clipboard icon, captioned
"Clipboard", sitting in the article where a photograph should be.

It is the share widget. Readability keeps it because it is an image with a
caption, and the caption filter added in 0.10.0 only knows the words logo,
banner, advertisement and newsletter.

**Do not add "clipboard" to that list.** The next one will be Copy, or
Share, or Print, and the list will grow forever. Filter on what the picture
*is*, which distinguishes the whole family at once:

- An interface icon is small and square. A news photograph is wide. If the
  markup gives width and height, a square under roughly 200px is not a
  photograph.
- Its address usually says so: `/icon`, `/icons/`, `share`, `sprite`,
  `button`, `ui/`.
- SVG is already excluded by `usableImage`; PNG at icon dimensions is the
  common case here.

Also worth checking whether this inflates the photo counts — ABS-CBN
reported 37/100 with a photo, and some of those may be icons rather than
pictures, which would make that number misleading rather than merely low.

## Next build: the lead photograph repeats

Reported on 0.12.0, an Inquirer News story: the same picture shown twice,
once as the lead and again as the first block of the body.

The cause is the duplicate collapse in `toBlocks`, widened in 0.10.0 to
compare against every block kept so far — but it keys on `b.text`, and image
blocks have none, so they are never compared at all. `seenImages` catches
repeats *within* the body; nothing compares the body against the lead.

`fromHtml` already removes the first body image when it exactly matches the
lead. Evidently that is not firing here — either the lead is chosen after
that check, or the two addresses differ slightly (a different crop or size
parameter of the same photograph, which is common).

**Establish which before writing the fix.** If the addresses differ, matching
on the address will not help and the comparison needs to be on the filename
stem rather than the whole URL.

## Next build: day and night by the clock

Switch automatically on time of day, rather than only when the reader taps
the moon.

Points to get right:

- **A tap must still win.** Someone who chooses day at nine in the evening
  wants day. Follow the clock only until they choose, then leave it alone
  until the next natural boundary — sunrise or sunset — rather than
  overriding them mid-evening.
- **Reasonable hours, not a hardcoded pair.** Roughly 6am to 6pm reads as
  day almost anywhere. Manila's daylight barely shifts through the year, so
  fixed hours are honest here; no need for a sunrise calculation.
- **Check on wake, not on a timer.** The app sits open for hours. Recompute
  when the tab becomes visible again, which costs nothing.
- **The device setting still matters.** iOS already has a night mode, and
  someone who has set it deliberately should not be argued with. Treat the
  system preference as the stronger signal where it exists.

Stored alongside the other display settings in `store.js`, with a third
state — automatic — beside day and night, so the button cycles
auto → day → night.

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
