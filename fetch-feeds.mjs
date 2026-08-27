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
import { fromHtml, fromFeedContent } from "./extract.mjs";
import { discover, looksLikeFeed } from "./discover.mjs";

const VERSION = "0.3.0";

const SOURCES_FILE  = "sources.json";
const ARTICLES_FILE = "articles.json";

const PER_SOURCE     = 15;    /* newest stories to keep per source */
const MAX_AGE_DAYS   = 4;     /* anything older is dropped */
const FETCH_BUDGET   = 45;    /* article pages to open in one run */
const FEED_PARALLEL  = 4;
const PAGE_PARALLEL  = 3;

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
  else return [];

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
  let res;

  try{
    res = await get(feedUrl, { accept: "application/rss+xml, application/xml, text/xml, */*" });
  }catch(err){
    res = null;
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
    report.note = report.note || "no response";
    return report;
  }
  if(res.status >= 400){
    report.note = "HTTP " + res.status;
    return report;
  }
  if(!looksLikeFeed(res.body)){
    report.note = "not a feed";
    return report;
  }

  const items = readFeed(res.body);
  if(!items.length){
    report.note = "feed had no items";
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

  /* Best case: the feed already carries the article. */
  const inline = fromFeedContent(item.full, item.link);
  if(inline){
    return {
      ...base,
      blocks: inline.blocks,
      image: base.image || inline.image,
      byline: base.byline || inline.byline
    };
  }

  /* Otherwise open the page and strip it down. */
  let page;
  try{
    page = await get(item.link, { accept: "text/html,application/xhtml+xml" });
  }catch(err){
    return { ...base, blocks: [{ type: "p", text: stripTags(item.summary) }].filter(b => b.text), truncated: true };
  }

  if(page.status >= 400 || !page.body){
    return { ...base, blocks: [{ type: "p", text: stripTags(item.summary) }].filter(b => b.text), truncated: true };
  }

  const out = fromHtml(page.body, page.url || item.link);

  return {
    ...base,
    blocks: out.blocks.length ? out.blocks
      : [{ type: "p", text: stripTags(item.summary) }].filter(b => b.text),
    image: base.image || out.image,
    byline: base.byline || out.byline,
    truncated: out.truncated
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

  console.log("Reading " + sources.length + " feeds\n");

  const reports = await pool(sources, FEED_PARALLEL, readSource);

  /* Decide what actually needs fetching. */
  const wanted = [];
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

    let fresh = 0;
    for(const item of r.items.slice(0, PER_SOURCE)){
      const id = idFor(source.id, item.link);
      const have = known.get(id);
      if(have && Array.isArray(have.blocks) && have.blocks.length){
        kept.push(have);
      }else{
        wanted.push({ item, source });
        fresh++;
      }
    }

    console.log("  " + source.name.padEnd(18) + " " +
      String(r.items.length).padStart(3) + " items, " + fresh + " new" +
      (r.note ? " — " + r.note : ""));
  });

  /* A budget stops one bad night from turning into a very long run. */
  const toFetch = wanted.slice(0, FETCH_BUDGET);
  const skipped = wanted.length - toFetch.length;

  console.log("\nFetching " + toFetch.length + " stories" +
    (skipped ? " (" + skipped + " left for the next run)" : "") + "\n");

  const fetched = await pool(toFetch, PAGE_PARALLEL,
    ({ item, source }) => readArticle(item, source));

  const fresh = fetched.filter(a => a && !a.error && a.title);

  /* ---------------- assemble ---------------- */

  const cutoff = Date.now() - MAX_AGE_DAYS * 86400000;
  const byId = new Map();

  [...kept, ...fresh].forEach(a => {
    if(!a || !a.id) return;
    if(new Date(a.published).getTime() < cutoff) return;
    byId.set(a.id, a);
  });

  /* Newest first, and no more than PER_SOURCE from any one outlet. */
  const perSource = new Map();
  const articles = Array.from(byId.values())
    .sort((x, y) => new Date(y.published) - new Date(x.published))
    .filter(a => {
      const n = (perSource.get(a.source) || 0) + 1;
      perSource.set(a.source, n);
      return n <= PER_SOURCE;
    });

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

  console.log("\nWrote " + articles.length + " stories to " + ARTICLES_FILE);
  console.log("  full text   " + withText);
  console.log("  with photo  " + withPic);
  console.log("  truncated   " + walled);
  console.log("  took        " + Math.round((Date.now() - started) / 1000) + "s");

  /* Never fail the job over one unreachable outlet — a partial
     file is far better than no file. */
  if(!articles.length){
    console.error("\nNo stories at all. Leaving the previous file in place.");
    process.exit(1);
  }
}

main().catch(err => {
  console.error("Fetcher failed:", err);
  process.exit(1);
});
