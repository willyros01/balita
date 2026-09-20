# To do

Everything outstanding, worst first. Nothing here is breaking the app.

---

## Known and unfixed

### All three Inquirer feeds read through the doorway

The three configured Inquirer feed hosts and their supported article subdomains
are routed through Cloudflare because GitHub's servers are frequently refused.
If another outlet starts returning 403, add its host to two places —
`THROUGH_THE_DOOR` in `net.mjs` and `ALLOWED` in the deployed Worker. Both, or
it will not route.

For all three Inquirer sources the doorway intentionally handles both the RSS
feed and supported article pages. Wire 0.17.20 restores the proven routing that
was narrowed in 0.17.15 and fixes an initialization defect that discarded
otherwise successful full-page extractions.

A direct request remains the freshness and failure fallback for each Inquirer
feed. When it contains a newer item, or the doorway feed is unavailable, Wire
uses the direct feed to discover current article URLs. Supported article pages
remain doorway-first, with a direct request as their fallback.

Every summary-only record is attempted once in the same recovery pass,
including retained records whose feed is temporarily unavailable. ABS-CBN is
excluded because its pages do not provide server-rendered article text.

Wire 0.17.18 adds a bounded article fallback ladder and independent direct and
doorway circuit breakers. Two HTTP 403 responses stop only that route for the
rest of the run; the other route may still succeed. The breaker resets on the
next run. Complete saved articles are never downgraded when every current route
fails.

Manila Bulletin still returns a Cloudflare challenge both directly and
through the doorway. It remains direct-only until a current feed that carries
usable article text is verified.

Wire 0.17.19 adds a three-day retention ceiling, including when a source is
unreachable, and expires a tapped notification route once a newer completed
feed proves that its exact article ID is no longer available.

The doorway does **not** help sites that build their pages in the browser.
ABS-CBN was tested: Cloudflare received the whole page and the article was
not in it. That is why ABS-CBN is `feedOnly` rather than routed.

### DW is a quarter of everything

139 stories against 15 or 20 from most outlets. Their feed is genuinely that
large. If it crowds the Philippine outlets out of the list, a per-source cap
for DW alone would fix it — but the general cap was removed on purpose, so
it should be a setting on that source, not a return to capping everything.

---

## Worth doing when convenient

### ABS-CBN if they ever rebuild

`feedOnly` because their pages arrive without the article. If the site
changes, drop the flag and probe again through the Worker. Nothing else
needs touching.

### GitHub's own scheduler

Still in `feeds.yml`, still barely firing — twice in four days. Harmless and
free, so left in place. `SCHEDULE.md` covers setting up a scheduler that
keeps proper time, which is the real answer.

---

## Worth knowing

**Clicks are unreliable on iOS in this app.** Buttons on the Sources screen
received touches and never received clicks — proved, not guessed, with an
on-screen touch reporter. iOS withholds a click when anything shifts under
the finger between press and release, and something on that screen does.
Five attempts to name it failed.

`onTap()` in `ui.js` binds both `click` and `pointerup`, with a guard so one
press acts once. **Use it for every control** rather than `addEventListener`
directly, or the button will work on a desktop and be dead on a phone.

## Watch for

These need a real example before they can be fixed. Send a screenshot when
one appears.

- **Furniture from outlets not yet seen.** Every publisher has its own
  newsletter block, share row and cross-link heading. The filters in
  `extract.mjs` cover four outlets so far. Prefer a rule about the family —
  players, placeholders, subscription pitches — over a rule about the exact
  words.
- **Stories fusing together**, as DW's did. The fix keys on that outlet's
  own short link. Another outlet doing the same would need its own boundary.
- **Pictures that are not photographs.** Interface icons are filtered by
  shape and address; something new will slip through eventually.

---

**The original list of six is closed.**

## Done, for the record

Sources buttons that had been dead since 0.7.0 · refresh button · crash
reporting on the Sources screen · DW capped at 25, every other source uncapped · Sunrise and sunset drive day and night · GitHub token reminder behind a
passcode · horizontal overflow that pushed the page off-screen · service
worker no longer freezes on an old version if a file is missing · strictly limited
breaking-news notifications · keyless GitHub-to-Google identity · per-device
notification opt in and removal · device Focus and Do Not Disturb preserved ·
Guardian's entity limit · stale stories held while awaiting re-extraction ·
invisible toast blocking every tap on iPhone · Delete as a labelled button ·
Doorway to Cloudflare · re-extraction when the rules change · invented
placeholder graphics removed · interface icons filtered · advertising
interruptions, newsletter blocks, subscription messages, mood widgets, audio
players, cross-link headings · DW stories cut at their boundary · Guardian
and DW images recovered · visible feedback and real confirm dialogs ·
sources matched by address · story caps removed · text to 50px · automatic
day and night.
