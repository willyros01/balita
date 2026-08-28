/* ============================================================
   extract.mjs — turn a news page into clean blocks.

   Two stages. Readability finds the article inside the page and
   discards navigation, banners, comment threads and the rest.
   Then we walk what is left and keep only the handful of things
   the reader knows how to draw.

   Nothing is passed through as HTML. Every block is plain text
   or a picture address, so no script or tracker can survive the
   trip to the phone.
   ============================================================ */

import { JSDOM, VirtualConsole } from "jsdom";

/* jsdom writes a full stack trace whenever a page carries CSS it
   cannot parse, which on news sites is most of them. Hundreds of
   them buried the summary and made a healthy run look broken.
   Nothing here depends on stylesheets, so it is safe to say
   nothing. Real errors still surface, because they come back as
   thrown exceptions rather than console output. */
const quiet = new VirtualConsole();
quiet.on("jsdomError", () => {});
import { Readability } from "@mozilla/readability";

/* Blocks the app can draw. Anything else is dropped. */
const KEEP = new Set(["P", "H2", "H3", "H4", "BLOCKQUOTE", "UL", "OL", "FIGURE", "IMG"]);

/* Lines that are furniture rather than journalism.

   Two kinds here. Some are whole paragraphs a publisher drops into
   the middle of an article — the advertising interruptions and the
   newsletter pitches. Readability keeps them, because structurally
   they are paragraphs like any other; only the words give them away.

   Matching has to be exact. A rule broad enough to be clever will
   eventually eat a real sentence, and a missing paragraph is worse
   than an unwanted one. */
const JUNK = [
  /^\s*$/,

  /* advertising interruptions, mid-article */
  /^article continues after this advertisement/i,
  /^story continues (after|below)/i,
  /^advertisement$/i,
  /^advertisement\s*[-\u2013\u2014:]/i,
  /^ad(vertising)?\s*$/i,
  /^sponsored( content| by)?$/i,
  /^promoted( content| by)?$/i,
  /^continue reading (below|the (main )?story)/i,
  /^scroll (down )?to continue/i,

  /* cross-links dropped into the copy */
  /^read (more|next|also|on)\b/i,
  /^read:/i,
  /^also read\b/i,
  /^related (stories|articles|news|reading)\b/i,
  /^more (on this|from)\b/i,
  /^see also\b/i,
  /^watch:?$/i,
  /^watch \| /i,
  /^listen:?$/i,
  /^in (photos|pictures):/i,

  /* the newsletter and subscription pitches */
  /^sign up (for|to)\b/i,
  /^subscribe (to|for|now)\b/i,
  /^get (the latest|our|breaking)\b.*\b(newsletter|inbox|updates)\b/i,
  /\bdelivered (straight )?to your inbox\b/i,
  /^join (our|the) (newsletter|mailing)/i,
  /^support (our|independent) journalism/i,
  /^become a (member|subscriber)\b/i,

  /* social and housekeeping */
  /^share (this|on|it)\b/i,
  /^follow (us|@)/i,
  /^click here\b/i,
  /^tags?:/i,
  /^filed under\b/i,
  /^copyright \u00a9/i,
  /^all rights reserved/i,

  /* caption and credit lines that leak into the body */
  /^photo(graph)? (by|courtesy|credit)/i,
  /^image (by|courtesy|credit)/i,
  /^file photo\b/i,
  /^\(?(reuters|afp|ap|pna|inquirer\.net|philstar\.com)\)?$/i
];

/* Signs the publisher has cut us off. */
const PAYWALL = [
  /subscribe to (continue|read)/i,
  /this (article|story) is for subscribers/i,
  /already a subscriber/i,
  /create an account to (continue|read)/i,
  /register to continue reading/i
];

function isJunk(text){
  const t = text.trim();
  if(t.length < 2) return true;
  return JUNK.some(re => re.test(t));
}

function absolute(src, base){
  if(!src) return null;
  try{
    return new URL(src, base).href;
  }catch(e){
    return null;
  }
}

/* Publishers hand out placeholder and tracking pixels freely. */
function usableImage(url){
  if(!url) return false;
  if(!/^https?:/i.test(url)) return false;
  if(/\.svg(\?|$)/i.test(url)) return false;
  if(/(spacer|pixel|blank|placeholder|1x1|transparent)\./i.test(url)) return false;
  return true;
}

function imageFrom(node, base){
  const img = node.tagName === "IMG" ? node : node.querySelector("img");
  if(!img) return null;

  /* Lazy-loaded pictures hide the real address in a data attribute. */
  let src = img.getAttribute("src")
    || img.getAttribute("data-src")
    || img.getAttribute("data-lazy-src")
    || img.getAttribute("data-original");

  /* A srcset gives us a choice; take the last, usually the largest. */
  if(!src){
    const set = img.getAttribute("srcset") || img.getAttribute("data-srcset");
    if(set){
      const parts = set.split(",").map(s => s.trim().split(/\s+/)[0]).filter(Boolean);
      src = parts[parts.length - 1];
    }
  }

  src = absolute(src, base);
  if(!usableImage(src)) return null;

  const capEl = node.tagName === "FIGURE" ? node.querySelector("figcaption") : null;
  let caption = capEl ? capEl.textContent.trim() : (img.getAttribute("alt") || "").trim();
  if(caption.length > 300) caption = caption.slice(0, 297).trimEnd() + "\u2026";
  if(isJunk(caption)) caption = "";

  return { src, caption };
}

/* ---------------- walking the article ---------------- */

function toBlocks(root, base){
  const blocks = [];
  const seenImages = new Set();

  const nodes = root.querySelectorAll(Array.from(KEEP).join(","));

  for(const node of nodes){
    /* Skip anything already covered by a parent we handled. */
    if(node.tagName === "IMG" && node.closest("figure")) continue;
    if(node.closest("blockquote") && node.tagName !== "BLOCKQUOTE") continue;
    if(node.closest("li")) continue;

    if(node.tagName === "FIGURE" || node.tagName === "IMG"){
      const img = imageFrom(node, base);
      if(img && !seenImages.has(img.src)){
        seenImages.add(img.src);
        blocks.push({ type: "image", src: img.src, caption: img.caption });
      }
      continue;
    }

    if(node.tagName === "UL" || node.tagName === "OL"){
      const items = Array.from(node.querySelectorAll(":scope > li"))
        .map(li => li.textContent.replace(/\s+/g, " ").trim())
        .filter(t => t && !isJunk(t));
      if(items.length) blocks.push({ type: "list", ordered: node.tagName === "OL", items });
      continue;
    }

    const text = node.textContent.replace(/\s+/g, " ").trim();
    if(isJunk(text)) continue;

    if(node.tagName === "BLOCKQUOTE"){
      blocks.push({ type: "quote", text });
    }else if(node.tagName === "P"){
      blocks.push({ type: "p", text });
    }else{
      blocks.push({ type: "h", text });
    }
  }

  /* Collapse a repeated block, which happens when a site renders
     the same paragraph twice for different screen widths. */
  const out = [];
  for(const b of blocks){
    const prev = out[out.length - 1];
    if(prev && prev.type === b.type && prev.text && prev.text === b.text) continue;
    out.push(b);
  }

  return out;
}

/* ---------------- lead picture ---------------- */

function leadImage(doc, base){
  const metas = [
    'meta[property="og:image"]',
    'meta[name="og:image"]',
    'meta[name="twitter:image"]',
    'meta[property="twitter:image"]'
  ];

  for(const sel of metas){
    const el = doc.querySelector(sel);
    const src = absolute(el && el.getAttribute("content"), base);
    if(usableImage(src)){
      const capEl = doc.querySelector("figure figcaption");
      return { src, caption: capEl ? capEl.textContent.replace(/\s+/g," ").trim().slice(0, 300) : "" };
    }
  }

  return null;
}

/* ---------------- byline ---------------- */

function byline(doc, article){
  if(article && article.byline){
    return article.byline.replace(/\s+/g, " ").replace(/^by\s+/i, "").trim().slice(0, 120);
  }
  const el = doc.querySelector('meta[name="author"], meta[property="article:author"]');
  const v = el && el.getAttribute("content");
  return v ? v.replace(/\s+/g, " ").trim().slice(0, 120) : "";
}

/* A feed body that stops mid-story. Inquirer's fullfeed does this
   constantly: it carries several real paragraphs and then simply
   stops, which is long enough to fool any word-count test. What
   gives it away is how it ends. */
const CUT_OFF = [
  /\u2026\s*$/,                       /* trailing ellipsis */
  /\.\.\.\s*$/,
  /\b(read|continue) (more|reading)\b/i,
  /\bfull (story|article)\b/i,
  /\bthe post .+ appeared first on\b/i,
  /[a-z,;:]\s*$/                       /* ends without punctuation */
];

export function looksCut(blocks){
  const paras = blocks.filter(b => b.type === "p" && b.text);
  if(!paras.length) return true;
  const last = paras[paras.length - 1].text.trim();
  return CUT_OFF.some(re => re.test(last));
}

/* ---------------- public ---------------- */

/* Pull an article out of raw page HTML.
   Returns { blocks, image, byline, truncated } — never throws. */
export function fromHtml(html, url){
  const empty = { blocks: [], image: null, byline: "", truncated: false };
  if(!html || html.length < 200) return empty;

  let dom;
  try{
    dom = new JSDOM(html, { url, virtualConsole: quiet });
  }catch(err){
    return empty;
  }

  const doc = dom.window.document;

  /* Take the lead picture before Readability prunes the head. */
  const lead = leadImage(doc, url);
  const rawText = doc.body ? doc.body.textContent : "";

  /* A subscription pitch in the footer is not a paywall. Requiring
     the phrase AND a thin article stops complete stories being
     marked cut short because the site sells subscriptions at the
     bottom of every page. */
  const pitch = PAYWALL.some(re => re.test(rawText));

  /* Readability offers isProbablyReaderable as a quick pre-check.
     It says no to plenty of honest articles — short ones, unusual
     markup, text in containers it does not recognise — and every
     no became a blank story. Cheaper to simply try and see. */
  let article = null;
  try{
    article = new Readability(doc.cloneNode(true), { charThreshold: 200 }).parse();
  }catch(err){
    article = null;
  }

  if(!article || !article.content){
    try{ dom.window.close(); }catch(e){}
    return { ...empty, image: lead, truncated: true };
  }

  /* The close has to be in a finally. Left inside the try, any error
     in toBlocks leaks the window, and enough leaked windows keep the
     whole process alive long after the work is done. */
  let blocks = [];
  let frag = null;
  try{
    frag = new JSDOM("<body>" + article.content + "</body>", { url, virtualConsole: quiet });
    blocks = toBlocks(frag.window.document.body, url);
  }catch(err){
    blocks = [];
  }finally{
    if(frag) try{ frag.window.close(); }catch(e){}
  }

  const words = blocks
    .filter(b => b.type === "p")
    .reduce((n, b) => n + b.text.split(/\s+/).length, 0);

  const author = byline(doc, article);
  dom.window.close();

  /* Drop a lead picture that the body already opens with. */
  let image = lead;
  if(image && blocks[0] && blocks[0].type === "image" && blocks[0].src === image.src){
    blocks.shift();
  }
  if(!image){
    const first = blocks.find(b => b.type === "image");
    if(first){
      image = { src: first.src, caption: first.caption };
      blocks = blocks.filter(b => b !== first);
    }
  }

  return {
    blocks,
    image,
    byline: author,
    words,
    /* A story is cut short when the publisher cut it, not when it is
       simply brief. Word count was flagging 156 of 326 — wire briefs,
       weather notices, sports results — and putting a warning panel
       on stories that were complete. A paywall notice in the page is
       real evidence; shortness is not. The threshold that remains
       only catches pages where extraction found almost nothing. */
    truncated: (pitch && words < 200) || words < 20
  };
}

/* Some feeds carry the whole article already. When they do there
   is no page to fetch, which is faster and kinder to the site. */
export function fromFeedContent(html, url){
  if(!html) return null;

  let frag = null;
  try{
    frag = new JSDOM("<body>" + html + "</body>", { url, virtualConsole: quiet });
    const blocks = toBlocks(frag.window.document.body, url);

    const words = blocks
      .filter(b => b.type === "p")
      .reduce((n, b) => n + b.text.split(/\s+/).length, 0);

    if(words < 40) return null;

    let image = null;
    const first = blocks.find(b => b.type === "image");
    if(first){
      image = { src: first.src, caption: first.caption };
    }

    return {
      blocks: blocks.filter(b => b !== first),
      image, byline: "", words,
      truncated: looksCut(blocks)
    };
  }catch(err){
    return null;
  }finally{
    if(frag) try{ frag.window.close(); }catch(e){}
  }
}
