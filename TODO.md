# To do

Everything outstanding, worst first. Nothing here is breaking the app.

---

## Known and unfixed

### Inquirer News reads through the doorway; other refusals may not

`newsinfo.inquirer.net` is routed through Cloudflare because GitHub's
servers are refused. If another outlet starts returning 403, add its host to
two places — `THROUGH_THE_DOOR` in `net.mjs` and `ALLOWED` in `worker.js`.
Both, or it will not route.

The doorway does **not** help sites that build their pages in the browser.
ABS-CBN was tested: Cloudflare received the whole page and the article was
not in it. That is why ABS-CBN is `feedOnly` rather than routed.

### The Guardian's feed fails the strict parser every run

`Entity expansion limit exceeded` — their feed carries enough escaped HTML
to trip a safety limit in the XML parser. The pattern-matching reader
recovers all 45 items, so nothing is lost, but the log carries a warning on
every run and it reads like a fault.

Either raise the limit in the parser options, or say plainly in the log that
this outlet is expected to need the fallback.

### DW is a quarter of everything

139 stories against 15 or 20 from most outlets. Their feed is genuinely that
large. If it crowds the Philippine outlets out of the list, a per-source cap
for DW alone would fix it — but the general cap was removed on purpose, so
it should be a setting on that source, not a return to capping everything.

---

## Worth doing when convenient

### Re-extraction drops stories rather than holding them

When the extractor version changes, stories awaiting re-reading are dropped
from `articles.json` instead of being kept with their old text. The count
fell from 517 to 250 during the 0.13.0 changeover. Self-correcting over two
or three runs, but the list thins out meanwhile. Keeping the old copy until
a new one arrives would be kinder.

### ABS-CBN if they ever rebuild

`feedOnly` because their pages arrive without the article. If the site
changes, drop the flag and probe again through the Worker. Nothing else
needs touching.

### GitHub's own scheduler

Still in `feeds.yml`, still barely firing — twice in four days. Harmless and
free, so left in place. `SCHEDULE.md` covers setting up a scheduler that
keeps proper time, which is the real answer.

---

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

## Done, for the record

Doorway to Cloudflare · re-extraction when the rules change · invented
placeholder graphics removed · interface icons filtered · advertising
interruptions, newsletter blocks, subscription messages, mood widgets, audio
players, cross-link headings · DW stories cut at their boundary · Guardian
and DW images recovered · visible feedback and real confirm dialogs ·
sources matched by address · story caps removed · text to 50px · automatic
day and night.
