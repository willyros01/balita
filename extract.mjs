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

import { JSDOM } from "jsdom";
import { Readability, isProbablyReaderable } from "@mozilla/readability";

/* Blocks the app can draw. Anything else is dropped. */
const KEEP = new Set(["P", "H2", "H3", "H4", "BLOCKQUOTE", "UL", "OL", "FIGURE", "IMG"]);

/* Lines that are furniture rather than journalism. */
const JUNK = [
  /^advertisement$/i,
  /^sponsored( content)?$/i,
  /^read (more|next|also)\b/i,
  /^related (stories|articles|news)\b/i,
  /^watch:?$/i,
  /^share (this|on)\b/i,
  /^follow us\b/i,
  /^sign up\b/i,
  /^subscribe\b/i,
  /^click here\b/i,
  /^photo(graph)? (by|courtesy)/i,
  /^\s*$/
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

/* ---------------- public ---------------- */

/* Pull an article out of raw page HTML.
   Returns { blocks, image, byline, truncated } — never throws. */
export function fromHtml(html, url){
  const empty = { blocks: [], image: null, byline: "", truncated: false };
  if(!html || html.length < 200) return empty;

  let dom;
  try{
    dom = new JSDOM(html, { url });
  }catch(err){
    return empty;
  }

  const doc = dom.window.document;

  /* Take the lead picture before Readability prunes the head. */
  const lead = leadImage(doc, url);
  const rawText = doc.body ? doc.body.textContent : "";
  const walled = PAYWALL.some(re => re.test(rawText));

  let article = null;
  try{
    if(isProbablyReaderable(doc)){
      article = new Readability(doc.cloneNode(true), { charThreshold: 250 }).parse();
    }
  }catch(err){
    article = null;
  }

  if(!article || !article.content){
    dom.window.close();
    return { ...empty, image: lead, truncated: walled };
  }

  let blocks = [];
  try{
    const frag = new JSDOM("<body>" + article.content + "</body>", { url });
    blocks = toBlocks(frag.window.document.body, url);
    frag.window.close();
  }catch(err){
    blocks = [];
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
    truncated: walled || words < 90
  };
}

/* Some feeds carry the whole article already. When they do there
   is no page to fetch, which is faster and kinder to the site. */
export function fromFeedContent(html, url){
  if(!html) return null;

  try{
    const frag = new JSDOM("<body>" + html + "</body>", { url });
    const blocks = toBlocks(frag.window.document.body, url);
    frag.window.close();

    const words = blocks
      .filter(b => b.type === "p")
      .reduce((n, b) => n + b.text.split(/\s+/).length, 0);

    /* Only trust it if it is a real article, not a teaser. */
    if(words < 160) return null;

    let image = null;
    const first = blocks.find(b => b.type === "image");
    if(first){
      image = { src: first.src, caption: first.caption };
    }

    return { blocks: blocks.filter(b => b !== first), image, byline: "", truncated: false };
  }catch(err){
    return null;
  }
}
