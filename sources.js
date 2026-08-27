/* ============================================================
   sources.js — the screen for adding and removing feeds.

   Changes are written straight to storage, so a feed added on
   the phone turns up on the laptop when Firebase is configured.
   ============================================================ */

import { PRESETS, PALETTE } from "./config.js";
import { saveSources } from "./store.js";

/* A short tag from a name: "Manila Bulletin" -> "MABU".
   Falls back to something rather than nothing. */
function tagFrom(name){
  const words = name.trim().split(/\s+/).filter(Boolean);
  if(words.length >= 2){
    return (words[0][0] + words[1][0] + (words[0][1] || "") + (words[1][1] || ""))
      .replace(/[^A-Za-z]/g, "").slice(0, 4).toUpperCase() || "NEW";
  }
  return name.replace(/[^A-Za-z]/g, "").slice(0, 4).toUpperCase() || "NEW";
}

/* Accepts a feed address or a plain home page. The fetcher will
   look for the feed itself, so we only need it to be a real URL. */
function tidyUrl(raw){
  let u = raw.trim();
  if(!u) return null;
  if(!/^https?:\/\//i.test(u)) u = "https://" + u;
  try{
    return new URL(u).href;
  }catch(e){
    return null;
  }
}

async function commit(ctx){
  await saveSources(ctx.state.sources);
  render(ctx);
}

export function render(ctx){
  const el = document.getElementById("manage");
  el.innerHTML = "";

  /* back */
  const back = document.createElement("button");
  back.type = "button";
  back.className = "back";
  back.innerHTML = '<span aria-hidden="true">\u2190</span> Back to stories';
  back.addEventListener("click", () => {
    ctx.show("feed");
    ctx.refresh();
    window.scrollTo(0, 0);
    ctx.announce("Back to all stories");
  });

  const title = document.createElement("h2");
  title.className = "mtitle";
  title.textContent = "Sources";

  const help = document.createElement("p");
  help.className = "mhelp";
  help.textContent = "Turn a source off to hide it without losing it.";

  /* Adding a source here changes what this device shows. It does not
     tell the fetcher to go and pull that feed — that list lives in
     sources.json. Without saying so, a newly added outlet looks
     broken: a chip with nothing behind it, forever. */
  const warn = document.createElement("p");
  warn.className = "mhelp";
  warn.textContent = "A source added here only changes what you see. " +
    "For its stories to actually arrive, it also has to be listed in " +
    "sources.json in the repository — that is the list the fetcher works from.";

  /* ---------------- the list ---------------- */
  const list = document.createElement("ul");
  list.className = "slist";

  ctx.state.sources.forEach(s => {
    const li = document.createElement("li");
    li.className = "srow";
    li.style.setProperty("--spine", s.color);

    const name = document.createElement("div");
    name.className = "sname";
    const strong = document.createElement("strong");
    strong.textContent = s.name;
    const small = document.createElement("small");
    small.textContent = s.url;
    name.append(strong, small);

    const tog = document.createElement("button");
    tog.type = "button";
    tog.className = "toggle";
    tog.textContent = s.on ? "On" : "Off";
    tog.setAttribute("aria-pressed", String(s.on));
    tog.setAttribute("aria-label", (s.on ? "Turn off " : "Turn on ") + s.name);
    tog.addEventListener("click", () => {
      s.on = !s.on;
      if(!s.on && ctx.state.filter === s.id) ctx.state.filter = "ALL";
      ctx.announce(s.name + (s.on ? " on" : " off"));
      commit(ctx);
    });

    const rm = document.createElement("button");
    rm.type = "button";
    rm.className = "remove";
    rm.innerHTML = '<span aria-hidden="true">\u2715</span>';
    rm.setAttribute("aria-label", "Remove " + s.name);
    rm.addEventListener("click", () => {
      ctx.state.sources = ctx.state.sources.filter(x => x.id !== s.id);
      if(ctx.state.filter === s.id) ctx.state.filter = "ALL";
      ctx.announce(s.name + " removed");
      commit(ctx);
    });

    li.append(name, tog, rm);
    list.appendChild(li);
  });

  if(!ctx.state.sources.length){
    const li = document.createElement("li");
    li.className = "empty";
    li.textContent = "No sources. Add one below.";
    list.appendChild(li);
  }

  /* ---------------- add by address ---------------- */
  const box = document.createElement("div");
  box.className = "addbox";

  const bh = document.createElement("h3");
  bh.textContent = "Add a source";
  const bp = document.createElement("p");
  bp.textContent = "Paste the outlet's feed address, or just its home page — " +
    "the app will look for the feed itself.";

  const lName = document.createElement("label");
  lName.setAttribute("for", "src-name");
  lName.textContent = "Name";
  const iName = document.createElement("input");
  iName.type = "text";
  iName.id = "src-name";
  iName.placeholder = "Straits Times";

  const lUrl = document.createElement("label");
  lUrl.setAttribute("for", "src-url");
  lUrl.textContent = "Address";
  const iUrl = document.createElement("input");
  iUrl.type = "url";
  iUrl.id = "src-url";
  iUrl.placeholder = "straitstimes.com";

  const err = document.createElement("p");
  err.className = "mhelp";
  err.style.margin = "0 0 0.6rem";
  err.hidden = true;

  const addBtn = document.createElement("button");
  addBtn.type = "button";
  addBtn.className = "primary";
  addBtn.textContent = "Add source";

  const fail = msg => {
    err.textContent = msg;
    err.hidden = false;
    ctx.announce(msg);
  };

  addBtn.addEventListener("click", () => {
    err.hidden = true;
    const nm = iName.value.trim();
    const url = tidyUrl(iUrl.value);

    if(!nm)  return fail("Give the source a name.");
    if(!url) return fail("That address does not look right. Check it and try again.");
    if(ctx.state.sources.some(s => s.url === url)) return fail("That source is already in the list.");

    ctx.state.sources.push({
      id: "u" + Date.now(),
      tag: tagFrom(nm),
      name: nm,
      url: url,
      color: PALETTE[ctx.state.sources.length % PALETTE.length],
      on: true
    });
    ctx.announce(nm + " added");
    commit(ctx);
  });

  box.append(bh, bp, lName, iName, lUrl, iUrl, err, addBtn);

  /* ---------------- presets ---------------- */
  const pres = document.createElement("div");
  pres.className = "presets";

  const spare = PRESETS.filter(p => !ctx.state.sources.some(s => s.url === p.url));

  if(spare.length){
    const ph = document.createElement("h3");
    ph.textContent = "Or pick from these";
    const wrap = document.createElement("div");
    wrap.className = "preset-wrap";

    spare.forEach(p => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "chip chip-add";
      b.textContent = "+ " + p.name;
      b.addEventListener("click", () => {
        ctx.state.sources.push({
          id: "p" + Date.now(),
          tag: p.tag, name: p.name, url: p.url, color: p.color, on: true
        });
        ctx.announce(p.name + " added");
        commit(ctx);
      });
      wrap.appendChild(b);
    });

    pres.append(ph, wrap);
  }

  el.append(back, title, help, warn, list, box, pres);
}

export function show(ctx){
  render(ctx);
  ctx.show("manage");
  window.scrollTo(0, 0);
  document.getElementById("manage").focus();
  ctx.announce("Sources");
}
