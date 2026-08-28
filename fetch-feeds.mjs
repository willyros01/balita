/* ============================================================
   fetch-feeds.mjs — the program that fills the app.

   Runs on GitHub's machines every half hour. For each source it
   reads the feed, works out which stories are new, fetches and
   strips those pages, and writes a fresh articles.json.

   Stories already in the file are left alone, so a run normally
   fetches only a handful of pages rather than all of them.

   Run by hand with:  node fetch-feeds.mjs
   ============================================================ */

import { readFile, writeFile } from "node:fs/promises";
import { XMLParser } from "fast-xml-parser";
import { get, pool } from "./net.mjs";
import { fromHtml, fromFeedContent, looksCut } from "./extract.mjs";
import { discover, looksLikeFeed } from "./discover.mjs";

const VERSION = "0.9.0";

const SOURCES_FILE  = "sources.json";
const ARTICLES_FILE = "articles.json";

/* No per-source cap and no age cutoff. Both were numbers I picked,
   and between them they were binning about thirty stories a run —
   including, on a busy day, the ones worth reading. A feed offers
   what it offers; keep all of it. A story leaves only when the
   outlet drops it from their own feed.

   PER_SOURCE now only bounds how many are read from one feed in a
   single pass, which no real feed reaches. */
const PER_SOURCE     = 200;
const FETCH_BUDGET   = 250;   /* article pages to open in one run */
const FEED_PARALLEL  = 5;
const PAGE_PARALLEL  = 10;  /* pacing is per host, so this is fine */
const PAGE_TIMEOUT   = 8000;  /* a page silent this long will not answer */
const PAGE_RETRIES   = 1;   /* one second chance; cheap now that pages are quick */

/* ---------------- feed parsing ---------------- */

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@",
  textNodeName: "#text",
  trimValues: true
});

const asArray = v => (v == null ? [] : Array.isArray(v) ? v : [v]);
const asText  = v => {
  if(v == null) return "";
  if(typeof v === "string") return v;
  if(typeof v === "object" && "#text" in v) return String(v["#text"]);
  return "";
};

function stripTags(html){
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function shorten(text, n){
  const t = stripTags(text);
  if(t.length <= n) return t;
  const cut = t.slice(0, n);
  const stop = cut.lastIndexOf(" ");
  return (stop > n * 0.6 ? cut.slice(0, stop) : cut).trimEnd() + "\u2026";
}

/* Walk the parsed document looking for the item or entry lists,
   wherever a publisher has chosen to put them. Depth-limited, and
   it takes the largest list it finds, since a feed's real entries
   always outnumber any stray element sharing the name. */
function findEntries(node, depth = 0){
  if(!node || typeof node !== "object" || depth > 6) return [];

  let best = [];

  for(const [key, value] of Object.entries(node)){
    const name = key.includes(":") ? key.split(":").pop() : key;

    if(name === "item" || name === "entry"){
      const list = asArray(value).filter(v => v && typeof v === "object");
      if(list.length > best.length) best = list;
    }

    if(value && typeof value === "object"){
      for(const child of asArray(value)){
        const found = findEntries(child, depth + 1);
        if(found.length > best.length) best = found;
      }
    }
  }

  return best;
}

/* RSS 2.0, Atom and RDF all in one, since Philippine outlets use
   all three between them. */
function readFeed(xml){
  let doc;
  try{
    doc = parser.parse(xml);
  }catch(err){
    return [];
  }

  const rss  = doc.rss && doc.rss.channel;
  const rdf  = doc["rdf:RDF"];
  const atom = doc.feed;

  let raw = [];
  if(rss)       raw = asArray(rss.item);
  else if(rdf)  raw = asArray(rdf.item);
  else if(atom) raw = asArray(atom.entry);

  /* The three shapes above cover almost everything, but a publisher
     only has to wrap the root differently — a namespace prefix, an
     extra element — and the items become unreachable while the file
     is still perfectly valid. That is how The Guardian's feed came
     back as "no items" when a browser showed it full of stories.

     Rather than special-case each one, go and find them: entries
     live under a key called item or entry wherever they sit. */
  if(!raw.length){
    raw = findEntries(doc);
  }

  if(!raw.length) return [];

  return raw.map(item => {
    /* link */
    let link = "";
    if(typeof item.link === "string"){
      link = item.link;
    }else if(Array.isArray(item.link)){
      const alt = item.link.find(l => !l["@rel"] || l["@rel"] === "alternate");
      link = (alt && alt["@href"]) || item.link[0]["@href"] || "";
    }else if(item.link && typeof item.link === "object"){
      link = item.link["@href"] || asText(item.link);
    }
    if(!link && item.guid) link = asText(item.guid);

    /* date */
    const when = asText(item.pubDate) || asText(item.published) ||
                 asText(item.updated) || asText(item["dc:date"]) || "";

    /* full text, where the feed offers it */
    const full = asText(item["content:encoded"]) ||
                 (atom ? asText(item.content) : "");

    /* summary */
    const summary = asText(item.description) || asText(item.summary) ||
                    asText(item.subtitle) || "";

    /* picture */
    let image = null;
    const media = asArray(item["media:content"]).concat(asArray(item["media:thumbnail"]));
    for(const m of media){
      const url = m && m["@url"];
      if(url && /^https?:/i.test(url)){ image = { src: url, caption: "" }; break; }
    }
    if(!image){
      for(const e of asArray(item.enclosure)){
        const url = e && e["@url"];
        const type = (e && e["@type"]) || "";
        if(url && /image/i.test(type)){ image = { src: url, caption: "" }; break; }
      }
    }

    /* section */
    const cats = asArray(item.category).map(c =>
      typeof c === "string" ? c : (c["@term"] || asText(c))
    ).filter(Boolean);

    return {
      title: stripTags(asText(item.title)),
      link: String(link || "").trim(),
      published: when,
      summary,
      full,
      image,
      section: cats[0] ? stripTags(cats[0]).slice(0, 40) : "",
      byline: stripTags(asText(item["dc:creator"]) || asText(item.author && item.author.name) || "")
    };
  }).filter(i => i.title && i.link);
}

/* ---------------- ids and dates ---------------- */

/* Stable across runs, so a story keeps its identity and we know
   we have already fetched it. */
function idFor(sourceId, link){
  let h = 5381;
  const s = sourceId + "|" + link;
  for(let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return sourceId + "-" + h.toString(36);
}

function isoDate(value){
  if(!value) return null;
  const t = new Date(value).getTime();
  if(Number.isNaN(t)) return null;
  /* A feed dated in the future is a bug at their end, not news. */
  return new Date(Math.min(t, Date.now())).toISOString();
}

/* ---------------- one source ---------------- */

async function readSource(source){
  const report = { id: source.id, name: source.name, ok: false, items: [], note: "" };

  let feedUrl = source.url;
  let res, firstError = "";

  try{
    res = await get(feedUrl, { accept: "application/rss+xml, application/xml, text/xml, */*" });
  }catch(err){
    res = null;
    firstError = err && err.message ? err.message : "no response";
  }

  /* Not a feed? Perhaps a home page was pasted. Go and look. */
  if(!res || !res.body || !looksLikeFeed(res.body)){
    const found = await discover(feedUrl).catch(() => null);
    if(found && found !== feedUrl){
      report.note = "feed found at " + found;
      feedUrl = found;
      res = await get(feedUrl).catch(() => null);
    }
  }

  if(!res || !res.body){
    report.note = firstError || "no response";
    return report;
  }
  if(res.status >= 400){
    /* 403 from a datacenter usually means the outlet blocks cloud
       traffic rather than that anything is broken. Worth naming. */
    report.note = "HTTP " + res.status +
      (res.status === 403 ? " — blocking this server" : "");
    return report;
  }
  if(!looksLikeFeed(res.body)){
    report.note = "not a feed";
    return report;
  }

  const items = readFeed(res.body);
  if(!items.length){
    /* Name the root element. "no items" on its own says nothing
       about whether the fault is theirs or ours. */
    let root = "unknown";
    try{
      const m = res.body.match(/<([a-z][\w:.-]*)[\s>]/i);
      if(m) root = m[1];
    }catch(e){}
    report.note = "feed parsed but held no items (root <" + root + ">, " +
      Math.round(res.body.length / 1024) + "kB)";
    return report;
  }

  report.ok = true;
  report.items = items.slice(0, PER_SOURCE * 2);
  return report;
}

/* ---------------- one story ---------------- */

async function readArticle(item, source){
  const base = {
    id: idFor(source.id, item.link),
    source: source.id,
    title: item.title,
    summary: shorten(item.summary, 200),
    byline: item.byline || "",
    section: item.section || "",
    published: isoDate(item.published) || new Date().toISOString(),
    url: item.link,
    image: item.image,
    blocks: [],
    truncated: false
  };

  const fallback = [{ type: "p", text: stripTags(item.summary) }].filter(b => b.text);

  /* What the feed itself gave us, if anything usable. */
  const inline = fromFeedContent(item.full, item.link);

  /* A complete article in the feed means no page to fetch — faster
     for us and kinder to the outlet. But "long" is not the same as
     "complete": Inquirer's fullfeed carries several real paragraphs
     and then stops, which sails past any word count. So we only
     skip the fetch when the text also ends like a finished story. */
  if(inline && !inline.truncated && inline.words >= 150){
    return {
      ...base,
      blocks: inline.blocks,
      image: base.image || inline.image,
      byline: base.byline || inline.byline,
      source_of_text: "feed"
    };
  }

  let page, pageError = "";
  try{
    page = await get(item.link, {
      accept: "text/html,application/xhtml+xml",
      timeout: PAGE_TIMEOUT,
      retries: PAGE_RETRIES
    });
    if(page.status >= 400) pageError = "HTTP " + page.status;
  }catch(err){
    page = null;
    pageError = (err && err.message) || "no response";
  }

  const out = (page && page.status < 400 && page.body)
    ? fromHtml(page.body, page.url || item.link)
    : null;

  /* Both versions in hand, keep whichever is more complete. A page
     that was blocked or timed out leaves the feed copy standing. */
  const pageWords = out ? out.words : 0;
  const feedWords = inline ? inline.words : 0;

  if(out && out.blocks.length && pageWords >= feedWords){
    return {
      ...base,
      blocks: out.blocks,
      image: base.image || out.image,
      byline: base.byline || out.byline,
      truncated: out.truncated,
      source_of_text: "page"
    };
  }

  if(inline && inline.blocks.length){
    return {
      ...base,
      blocks: inline.blocks,
      image: base.image || inline.image,
      byline: base.byline || inline.byline,
      truncated: inline.truncated,
      source_of_text: "feed"
    };
  }

  return {
    ...base, blocks: fallback, truncated: true,
    source_of_text: "summary",
    why: pageError || "nothing could be extracted"
  };
}

/* ---------------- the run ---------------- */

async function main(){
  const started = Date.now();

  const sources = JSON.parse(await readFile(SOURCES_FILE, "utf8"))
    .filter(s => s.on !== false);

  /* Whatever we already have. Reusing it is what keeps runs short. */
  let existing = [];
  try{
    const prev = JSON.parse(await readFile(ARTICLES_FILE, "utf8"));
    if(Array.isArray(prev.articles)) existing = prev.articles;
  }catch(err){
    /* first run */
  }

  /* Sample data from earlier versions should not survive. */
  existing = existing.filter(a => a.id && !String(a.id).startsWith("sample-"));

  const known = new Map(existing.map(a => [a.id, a]));

  console.log("Wire fetcher " + VERSION);
  console.log("Reading " + sources.length + " feeds\n");

  const reports = await pool(sources, FEED_PARALLEL, readSource);

  /* Decide what actually needs fetching, keeping each source's
     queue separate so the budget can be shared out fairly. */
  const queues = new Map();
  const kept   = [];

  reports.forEach((r, i) => {
    const source = sources[i];

    if(!r || r.error || !r.ok){
      const why = (r && (r.note || (r.error && r.error.message))) || "failed";
      console.log("  " + source.name.padEnd(18) + " skipped — " + why);
      /* Keep what we already had from this source. */
      kept.push(...existing.filter(a => a.source === source.id));
      return;
    }

    const queue = [];
    let reused = 0;

    for(const item of r.items.slice(0, PER_SOURCE)){
      const id = idFor(source.id, item.link);
      const have = known.get(id);
      if(have && Array.isArray(have.blocks) && have.blocks.length){
        kept.push(have);
        reused++;
      }else{
        queue.push({ item, source });
      }
    }

    if(queue.length) queues.set(source.id, queue);

    console.log("  " + source.name.padEnd(18) +
      String(r.items.length).padStart(3) + " in feed, " +
      String(reused).padStart(2) + " already had, " +
      String(queue.length).padStart(2) + " to fetch" +
      (r.note ? " — " + r.note : ""));
  });

  /* Take one from each source in turn rather than draining them in
     order. Whichever outlet sat last in the list used to be starved
     entirely whenever the budget ran out; now a shortfall is shared
     out evenly and everybody gets their most recent stories first. */
  const wanted = [];
  const lists = Array.from(queues.values());
  for(let round = 0; wanted.length < FETCH_BUDGET; round++){
    let placed = false;
    for(const list of lists){
      if(round >= list.length) continue;
      wanted.push(list[round]);
      placed = true;
      if(wanted.length >= FETCH_BUDGET) break;
    }
    if(!placed) break;
  }

  const queued  = lists.reduce((n, l) => n + l.length, 0);
  const skipped = queued - wanted.length;

  console.log("\nFetching " + wanted.length + " stories" +
    (skipped ? " (" + skipped + " left for the next run)" : "") + "\n");

  const started2 = Date.now();
  const fetched = await pool(wanted, PAGE_PARALLEL,
    ({ item, source }) => readArticle(item, source));

  const fresh = fetched.filter(a => a && !a.error && a.title);

  /* Say plainly what each source actually came away with, so a
     source that quietly got nothing is visible in the log. */
  if(fresh.length || kept.length){
    console.log("Per source, after fetching:");
    for(const source of sources){
      const got  = fresh.filter(a => a.source === source.id);
      const page = got.filter(a => a.source_of_text === "page").length;
      const feedT= got.filter(a => a.source_of_text === "feed").length;
      const only = got.filter(a => a.source_of_text === "summary").length;
      const old  = kept.filter(a => a.source === source.id).length;
      if(!got.length && !old) continue;
      console.log("  " + source.name.padEnd(18) +
        String(got.length + old).padStart(3) + " stories  " +
        "(page " + page + ", feed " + feedT + ", summary only " + only +
        ", reused " + old + ")");
    }
    console.log("  fetching took " + Math.round((Date.now() - started2) / 1000) + "s");

    /* When a source falls back a lot, name the reason. Otherwise the
       only signal is a number, and a number does not suggest a fix. */
    const reasons = new Map();
    fresh.filter(a => a.source_of_text === "summary" && a.why).forEach(a => {
      const key = a.source + " \u2014 " + a.why;
      reasons.set(key, (reasons.get(key) || 0) + 1);
    });
    if(reasons.size){
      console.log("\n  Why stories fell back to the summary:");
      for(const [key, n] of [...reasons].sort((x, y) => y[1] - x[1])){
        console.log("    " + String(n).padStart(3) + "  " + key);
      }
    }
    console.log("");
  }

  /* ---------------- assemble ---------------- */

  /* A story stays until the outlet stops listing it. That is the
     only honest reason to drop one — not an age I invented. */
  const stillListed = new Set();
  reports.forEach((r, i) => {
    if(!r || !r.ok) return;
    r.items.forEach(item => stillListed.add(idFor(sources[i].id, item.link)));
  });

  const liveSources = new Set(reports.map((r, i) => (r && r.ok) ? sources[i].id : null));

  const byId = new Map();
  let retired = 0;

  [...kept, ...fresh].forEach(a => {
    if(!a || !a.id) return;

    /* Only retire a story when its own feed answered this run and no
       longer carries it. If an outlet was unreachable, keep what we
       have rather than quietly emptying it. */
    if(liveSources.has(a.source) && !stillListed.has(a.id)){
      retired++;
      return;
    }
    byId.set(a.id, a);
  });

  const articles = Array.from(byId.values())
    .sort((x, y) => new Date(y.published) - new Date(x.published));

  const out = {
    version: VERSION,
    updated: new Date().toISOString(),
    sources: sources.map(s => ({ id: s.id, name: s.name })),
    articles
  };

  await writeFile(ARTICLES_FILE, JSON.stringify(out, null, 2) + "\n");

  const withText = articles.filter(a => a.blocks && a.blocks.length > 1).length;
  const withPic  = articles.filter(a => a.image && a.image.src).length;
  const walled   = articles.filter(a => a.truncated).length;
  const bare     = articles.filter(a => a.source_of_text === "summary").length;
  const dropped  = retired;

  console.log("Wrote " + articles.length + " stories to " + ARTICLES_FILE);
  console.log("  full text     " + withText);
  console.log("  with photo    " + withPic);
  console.log("  cut short     " + walled);
  console.log("  summary only  " + bare);
  if(dropped > 0){
    console.log("  retired       " + dropped + " (no longer listed by their outlet)");
  }
  console.log("  took          " + Math.round((Date.now() - started) / 1000) + "s");

  /* Never fail the job over one unreachable outlet — a partial
     file is far better than no file. */
  if(!articles.length){
    console.error("\nNo stories at all. Leaving the previous file in place.");
    process.exit(1);
  }
}

/* The work finishes in well under a minute, but the process used to
   sit there for another six. Parsing a hundred pages leaves enough
   behind that the event loop never drains on its own. Everything we
   care about is already written to disk by this point, so say so and
   go rather than waiting to be told. */
main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error("Fetcher failed:", err);
    process.exit(1);
  });
