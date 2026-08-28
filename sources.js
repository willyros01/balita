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

async function commit(ctx, undo){
  await saveSources(ctx.state.sources);
  render(ctx, undo);
}

export function render(ctx, undo){
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
    /* Removing is not something a stray tap should manage. The first
       press asks, the second does it. Sitting beside the on/off
       toggle, an unguarded cross was far too easy to hit — more so at
       the larger text sizes, where everything sits closer together. */
    let asking = false;
    let askTimer = null;

    const rest = () => {
      asking = false;
      window.clearTimeout(askTimer);
      rm.classList.remove("remove-armed");
      rm.innerHTML = '<span aria-hidden="true">\u2715</span>';
      rm.setAttribute("aria-label", "Remove " + s.name);
    };

    rm.addEventListener("click", () => {
      if(!asking){
        asking = true;
        rm.classList.add("remove-armed");
        rm.textContent = "Remove?";
        rm.setAttribute("aria-label", "Confirm removing " + s.name);
        ctx.announce("Tap again to remove " + s.name);
        askTimer = window.setTimeout(rest, 5000);
        return;
      }

      rest();
      const gone = { ...s };
      const at = ctx.state.sources.findIndex(x => x.id === s.id);
      ctx.state.sources = ctx.state.sources.filter(x => x.id !== s.id);
      if(ctx.state.filter === s.id) ctx.state.filter = "ALL";
      markRemoved(s.id);
      ctx.announce(gone.name + " removed");
      commit(ctx, { source: gone, at });
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

  /* A way back from the last removal, for as long as the screen
     stays open. Confirmation catches the stray tap; this catches
     the deliberate one that turns out to be a mistake. */
  let undoBar = null;
  if(undo && undo.source){
    undoBar = document.createElement("div");
    undoBar.className = "undo";

    const said = document.createElement("span");
    said.textContent = undo.source.name + " removed.";

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "undo-btn";
    btn.textContent = "Undo";
    btn.addEventListener("click", () => {
      unmarkRemoved(undo.source.id);
      const at = Math.max(0, Math.min(undo.at, ctx.state.sources.length));
      ctx.state.sources.splice(at, 0, undo.source);
      ctx.announce(undo.source.name + " restored");
      commit(ctx);
    });

    undoBar.append(said, btn);
  }

  /* The way out of any mess, without going near Safari's settings. */
  const reset = document.createElement("div");
  reset.className = "reset-row";

  const resetBtn = document.createElement("button");
  resetBtn.type = "button";
  resetBtn.className = "reset-btn";
  resetBtn.textContent = "Restore the standard list";

  let resetAsking = false;
  resetBtn.addEventListener("click", async () => {
    if(!resetAsking){
      resetAsking = true;
      resetBtn.textContent = "Tap again to confirm";
      resetBtn.classList.add("remove-armed");
      ctx.announce("Tap again to restore the standard list");
      window.setTimeout(() => {
        resetAsking = false;
        resetBtn.textContent = "Restore the standard list";
        resetBtn.classList.remove("remove-armed");
      }, 5000);
      return;
    }
    ctx.state.sources = await restoreStandard();
    ctx.state.filter = "ALL";
    ctx.announce("Standard list restored");
    render(ctx);
  });

  const resetWhy = document.createElement("p");
  resetWhy.className = "mhelp";
  resetWhy.style.margin = "0.5rem 0 0";
  resetWhy.textContent = "Puts back every outlet the fetcher works from, " +
    "switched on. Sources you added yourself are dropped.";

  reset.append(resetBtn, resetWhy);

  const parts = [back, title, help, warn];
  if(undoBar) parts.push(undoBar);
  parts.push(list, box, pres, reset);
  el.append(...parts);
}

export function show(ctx){
  render(ctx);
  ctx.show("manage");
  window.scrollTo(0, 0);
  document.getElementById("manage").focus();
  ctx.announce("Sources");
}
