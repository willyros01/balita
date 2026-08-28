/* ============================================================
   discover.mjs — turn a home page address into a feed address.

   Lets you add a source by pasting "philstar.com" rather than
   hunting for the feed link yourself.
   ============================================================ */

import { get } from "./net.mjs";

/* Discovery is guesswork: most of these addresses will not exist, and
   an address that has not answered in five seconds is not going to.
   Retrying every guess three times turned two unreachable outlets
   into six minutes of waiting. One quick attempt each. */
const PROBE = { timeout: 5000, retries: 0 };

/* Feeds announce themselves in the page head. */
const LINK_RE = /<link\b[^>]*>/gi;

/* Paths worth trying when a page announces nothing. */
const GUESSES = [
  "/feed", "/rss", "/feed/", "/rss.xml", "/index.xml",
  "/atom.xml", "/feeds/all.xml", "/rss/headlines"
];

const FEED_TYPES = [
  "application/rss+xml",
  "application/atom+xml",
  "application/xml",
  "text/xml"
];

function attr(tag, name){
  const m = tag.match(new RegExp(name + '\\s*=\\s*("([^"]*)"|\'([^\']*)\')', "i"));
  return m ? (m[2] ?? m[3] ?? "") : "";
}

/* Does this body actually look like a feed? Content types lie
   often enough that sniffing the first bytes is worth it. */
export function looksLikeFeed(body){
  if(!body) return false;
  const head = body.slice(0, 1500).toLowerCase();
  return head.includes("<rss") || head.includes("<feed") || head.includes("<rdf:rdf");
}

export async function discover(pageUrl){
  let base;
  try{
    base = new URL(pageUrl);
  }catch(e){
    return null;
  }

  /* Perhaps it is already a feed. */
  const direct = await get(base.href, PROBE).catch(() => null);
  if(direct && looksLikeFeed(direct.body)) return base.href;

  /* Look for an announced feed in the head. */
  if(direct && direct.body){
    const tags = direct.body.match(LINK_RE) || [];
    const candidates = [];

    for(const tag of tags){
      const rel  = attr(tag, "rel").toLowerCase();
      const type = attr(tag, "type").toLowerCase();
      const href = attr(tag, "href");
      if(!href) continue;
      if(!rel.includes("alternate") && !rel.includes("feed")) continue;
      if(type && !FEED_TYPES.includes(type)) continue;
      candidates.push(new URL(href, base).href);
    }

    for(const href of candidates){
      const res = await get(href, PROBE).catch(() => null);
      if(res && looksLikeFeed(res.body)) return href;
    }
  }

  /* Nothing announced. Try the usual paths. */
  for(const path of GUESSES){
    const href = new URL(path, base.origin).href;
    const res = await get(href, PROBE).catch(() => null);
    if(res && looksLikeFeed(res.body)) return href;
  }

  return null;
}
