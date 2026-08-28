/* ============================================================
   reader.js — one story, with everything else taken away.

   The fetcher hands over an article as a list of blocks rather
   than a lump of HTML. Nothing from a news site is ever inserted
   as markup, so no script, tracker or advertisement can ride in
   with the text. Anything the fetcher does not recognise is
   simply not drawn.
   ============================================================ */

import { timeAgo, placeholder } from "./feed.js";

/* Block kinds this screen knows how to draw. */
const KNOWN = new Set(["p", "h", "quote", "list", "image"]);

function figureFor(image, seed, alt){
  const fig = document.createElement("figure");

  if(image && image.src){
    const img = document.createElement("img");
    img.src = image.src;
    img.alt = alt || image.caption || "";
    img.loading = "lazy";
    img.decoding = "async";
    img.addEventListener("error", () => { fig.innerHTML = placeholder(seed, 800, 450); });
    fig.appendChild(img);
  }else{
    fig.innerHTML = placeholder(seed, 800, 450);
  }

  if(image && image.caption){
    const cap = document.createElement("figcaption");
    cap.textContent = image.caption;
    fig.appendChild(cap);
  }

  return fig;
}

function blockFor(block, seed){
  if(!block || !KNOWN.has(block.type)) return null;

  if(block.type === "p"){
    if(!block.text) return null;
    const p = document.createElement("p");
    p.textContent = block.text;
    return p;
  }

  if(block.type === "h"){
    const h = document.createElement("h3");
    h.textContent = block.text || "";
    return h;
  }

  if(block.type === "quote"){
    const q = document.createElement("blockquote");
    const p = document.createElement("p");
    p.textContent = block.text || "";
    q.appendChild(p);
    return q;
  }

  if(block.type === "list"){
    const ul = document.createElement(block.ordered ? "ol" : "ul");
    (block.items || []).forEach(t => {
      const li = document.createElement("li");
      li.textContent = t;
      ul.appendChild(li);
    });
    return ul.childElementCount ? ul : null;
  }

  if(block.type === "image"){
    return figureFor(block, seed);
  }

  return null;
}

export function open(ctx, id){
  const a = ctx.state.articles.find(x => x.id === id);
  if(!a) return;

  const src = ctx.sourceOf(a.source);
  const el  = document.getElementById("reader");

  el.style.setProperty("--spine", src ? src.color : "var(--rule)");
  el.innerHTML = "";

  /* back */
  const back = document.createElement("button");
  back.type = "button";
  back.className = "back";
  back.innerHTML = '<span aria-hidden="true">\u2190</span> All stories';
  back.addEventListener("click", () => close(ctx));

  /* head */
  const head = document.createElement("header");
  head.className = "article-head";

  const meta = document.createElement("p");
  meta.className = "meta";
  if(src){
    const tag = document.createElement("span");
    tag.className = "tag";
    tag.textContent = src.tag;
    meta.appendChild(tag);
  }
  if(a.section){
    const dot = document.createElement("span");
    dot.className = "dot";
    dot.setAttribute("aria-hidden", "true");
    dot.textContent = "\u00B7";
    const sp = document.createElement("span");
    sp.textContent = a.section;
    meta.append(dot, sp);
  }

  const h2 = document.createElement("h2");
  h2.className = "article-title";
  h2.textContent = a.title;

  const by = document.createElement("p");
  by.className = "byline";
  by.textContent = [a.byline, timeAgo(a.published)].filter(Boolean).join(" \u00B7 ");

  head.append(meta, h2, by);

  /* A story with no picture gets none. The invented grey graphic
     reads as a broken image and pushes half a screen of story down,
     which is worse than a plain start. It still earns its place as
     a small thumbnail in the list, where it keeps the rows even. */
  const lead = (a.image && a.image.src) ? figureFor(a.image, 0, a.title) : null;

  /* body */
  const body = document.createElement("div");
  body.className = "article-body";

  const blocks = Array.isArray(a.blocks) ? a.blocks : [];
  blocks.forEach((b, i) => {
    const node = blockFor(b, i + 1);
    if(node) body.appendChild(node);
  });

  if(!body.childElementCount){
    const p = document.createElement("p");
    p.textContent = a.summary || "The text of this story could not be retrieved.";
    body.appendChild(p);
  }

  /* A story that arrived incomplete should say why, in plain words,
     and offer the way out. Left unexplained it just looks broken. */
  const outlet = src ? src.name : "the publisher";
  const bare   = a.source_of_text === "summary";

  if(bare || a.truncated){
    const panel = document.createElement("aside");
    panel.className = "elsewhere";

    const h = document.createElement("p");
    h.className = "elsewhere-head";
    h.textContent = bare ? "Headline only" : "Story cut short";

    const why = document.createElement("p");
    why.className = "elsewhere-why";
    why.textContent = bare
      ? outlet + " does not let this app read its pages, so only the " +
        "headline and summary came through. The full story is on their site."
      : "This is as far as the text came through. " + outlet +
        " keeps the rest on their own site, or behind a subscription.";

    panel.append(h, why);

    if(a.url){
      const go = document.createElement("a");
      go.className = "elsewhere-go";
      go.href = a.url;
      go.target = "_blank";
      go.rel = "noopener noreferrer";
      go.textContent = "Read it on " + outlet + " \u2197";
      panel.appendChild(go);

      const warn = document.createElement("p");
      warn.className = "elsewhere-warn";
      warn.textContent = "Opens their site, with their advertising.";
      panel.appendChild(warn);
    }

    body.appendChild(panel);
  }

  /* origin */
  const origin = document.createElement("p");
  origin.className = "origin";
  origin.append(document.createTextNode("Originally published by " + outlet + ". "));
  if(a.url && !bare && !a.truncated){
    const link = document.createElement("a");
    link.href = a.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = "Open on their site";
    origin.appendChild(link);
  }

  el.append(back, head);
  if(lead) el.appendChild(lead);
  el.append(body, origin);

  ctx.show("reader");
  window.scrollTo(0, 0);
  el.focus();
  ctx.announce("Opened: " + a.title);
}

export function close(ctx){
  ctx.show("feed");
  window.scrollTo(0, 0);
  ctx.announce("Back to all stories");
}
