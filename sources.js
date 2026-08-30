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
  try{
    build(ctx);
  }catch(err){
    /* A throw partway through used to leave the screen half drawn,
       with the controls that had not been reached simply absent —
       indistinguishable from buttons that do not work. Now it says
       what happened. */
    const el = document.getElementById("manage");
    const p = document.createElement("pre");
    p.className = "crash";
    p.textContent = "Something went wrong drawing this screen:\n\n" +
      (err && err.message ? err.message : String(err)) +
      "\n\n" + ((err && err.stack) || "").split("\n").slice(0, 4).join("\n");
    el.appendChild(p);
    console.error(err);
  }
}

function build(ctx){
  const el = document.getElementById("manage");
  el.innerHTML = "";

  /* The version, here, because this is the screen people look at
     when something is wrong — and it was only ever shown at the
     bottom of the story list. */
  const ver = document.createElement("p");
  ver.className = "manage-version";
  ver.textContent = "Wire " + (ctx.version || "?");

  /* A control that reports being touched separates "the button is
     broken" from "the tap never arrived", which four rounds of
     guessing could not. */
  const probe = document.createElement("button");
  probe.type = "button";
  probe.className = "reset-btn";
  probe.style.marginTop = "0.5rem";
  probe.textContent = "Tap here to test";
  onTap(probe, () => toast("The tap arrived", "undone"));


  /* back */
  const back = document.createElement("button");
  back.type = "button";
  back.className = "back";
  back.innerHTML = '<span aria-hidden="true">\u2190</span> Back to stories';
  onTap(back, () => {
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
  /* How many stories the app actually holds for each source. An
     outlet with none used to look identical to a working one. */
  const counts = new Map();
  (ctx.state.articles || []).forEach(a => {
    counts.set(a.source, (counts.get(a.source) || 0) + 1);
  });

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

    const n = counts.get(s.id) || 0;
    if(n){
      const c = document.createElement("small");
      c.className = "count-pill";
      c.textContent = n + (n === 1 ? " story" : " stories");
      name.appendChild(c);
    }else{
      const none = document.createElement("span");
      none.className = "no-stories";
      none.textContent = "No stories yet";
      name.appendChild(none);
    }

    const tog = document.createElement("button");
    tog.type = "button";
    tog.className = "toggle";
    tog.textContent = s.on ? "On" : "Off";
    tog.setAttribute("aria-pressed", String(s.on));
    tog.setAttribute("aria-label", (s.on ? "Turn off " : "Turn on ") + s.name);
    onTap(tog, () => {
      toast("Tap registered \u2014 " + s.name, "done");
      s.on = !s.on;
      if(!s.on && ctx.state.filter === s.id) ctx.state.filter = "ALL";
      toast(s.name + (s.on ? " switched on" : " switched off"), "done");
      commit(ctx);
    });

    const rm = document.createElement("button");
    rm.type = "button";
    rm.className = "remove";
    rm.textContent = "Delete";
    rm.setAttribute("aria-label", "Delete " + s.name);
    /* A real question, asked once. The old button armed itself and
       disarmed after five seconds, so tapping it repeatedly just
       toggled it forever and it could never fire. */
    onTap(rm, async () => {
      const yes = await ask({
        title: "Remove " + s.name + "?",
        body: "It disappears from your list and its stories stop showing. " +
              "You can undo this straight afterwards, or put everything back " +
              "with Restore the standard list.",
        confirmLabel: "Remove",
        cancelLabel: "Keep it",
        danger: true
      });
      if(!yes) return;

      const gone = { ...s };
      const at = ctx.state.sources.findIndex(x => x.id === s.id);
      ctx.state.sources = ctx.state.sources.filter(x => x.id !== s.id);
      if(ctx.state.filter === s.id) ctx.state.filter = "ALL";
      markRemoved(s.id);

      await saveSources(ctx.state.sources);
      render(ctx);

      toast(gone.name + " removed", "done", {
        label: "Undo",
        onTap: async () => {
          unmarkRemoved(gone.id);
          const back = Math.max(0, Math.min(at, ctx.state.sources.length));
          ctx.state.sources.splice(back, 0, gone);
          await saveSources(ctx.state.sources);
          render(ctx);
          toast(gone.name + " is back", "undone");
        }
      });
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
    toast(msg, "warn");
  };

  onTap(addBtn, () => {
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
    toast(nm + " added. It will fill once the fetcher knows about it.", "done");
    commit(ctx);
  });

  box.append(bh, bp, lName, iName, lUrl, iUrl, err, addBtn);

  /* ---------------- presets ---------------- */
  const pres = document.createElement("div");
  pres.className = "presets";

  /* Presets used to offer outlets the fetcher had never heard of, so
     adding one produced a chip that would stay empty forever. Only
     offer what is actually in the fetcher's own list. */
  const fetcherUrls = new Set((ctx.state.standard || []).map(x => x.url));
  const spare = PRESETS
    .filter(p => fetcherUrls.has(p.url))
    .filter(p => !ctx.state.sources.some(s => s.url === p.url));

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
        toast(p.name + " added", "done");
        commit(ctx);
      });
      wrap.appendChild(b);
    });

    pres.append(ph, wrap);
  }

  /* Stories the app holds whose source is not in this list. This is
     precisely what went wrong for an evening: the file had ninety-four
     stories, several outlets showed nothing, and there was no way to
     see the mismatch. */
  const known = new Set(ctx.state.sources.map(x => x.id));
  const orphanIds = [...new Set((ctx.state.articles || [])
    .map(a => a.source).filter(id => !known.has(id)))];

  let orphan = null;
  if(orphanIds.length){
    const n = (ctx.state.articles || []).filter(a => orphanIds.includes(a.source)).length;
    orphan = document.createElement("p");
    orphan.className = "orphan";
    orphan.textContent = n + (n === 1 ? " story is" : " stories are") +
      " held for " + orphanIds.length +
      (orphanIds.length === 1 ? " source" : " sources") +
      " missing from this list (" + orphanIds.join(", ") + "). " +
      "Restore the standard list below to bring them back.";
  }

  /* ---------------- the token reminder ----------------
     A GitHub token expires, and when it does the app quietly stops
     updating. Nothing announces it. So the date is kept here and
     the app says something while there is still time to act. */
  const admin = document.createElement("div");
  admin.className = "admin-row";
  renderAdmin(ctx, admin);

  /* The way out of any mess, without going near Safari's settings. */
  const reset = document.createElement("div");
  reset.className = "reset-row";

  const resetBtn = document.createElement("button");
  resetBtn.type = "button";
  resetBtn.className = "reset-btn";
  resetBtn.textContent = "Restore the standard list";

  onTap(resetBtn, async () => {
    const yes = await ask({
      title: "Restore the standard list?",
      body: "Every outlet the fetcher works from comes back, switched on. " +
            "Sources you added yourself are removed, and your on and off " +
            "choices are reset.",
      confirmLabel: "Restore",
      cancelLabel: "Cancel"
    });
    if(!yes) return;

    resetBtn.disabled = true;
    resetBtn.textContent = "Restoring\u2026";

    try{
      ctx.state.sources = await restoreStandard();
      ctx.state.filter = "ALL";
      render(ctx);
      toast(ctx.state.sources.length + " sources restored, all switched on", "undone");
    }catch(err){
      resetBtn.disabled = false;
      resetBtn.textContent = "Restore the standard list";
      toast("Could not restore the list. Check your connection.", "warn");
    }
  });

  const resetWhy = document.createElement("p");
  resetWhy.className = "mhelp";
  resetWhy.style.margin = "0.5rem 0 0";
  resetWhy.textContent = "Puts back every outlet the fetcher works from, " +
    "switched on. Sources you added yourself are dropped.";

  reset.append(resetBtn, resetWhy);

  const report = document.createElement("p");
  report.id = "tap-report";
  report.className = "manage-version";
  report.textContent = "Touch anywhere on this screen and this line will "
    + "say what it landed on.";

  const parts = [back, ver, probe, report, title, help, warn];
  parts.push(list);
  if(orphan) parts.push(orphan);
  parts.push(box, pres, admin, reset);
  el.append(...parts);
}

export function show(ctx){
  render(ctx);
  ctx.show("manage");
  window.scrollTo(0, 0);
  document.getElementById("manage").focus();
  ctx.announce("Sources");
}


/* ============================================================
   The GitHub token reminder, behind a passcode.
   ============================================================ */

function fmtDate(iso){
  const d = new Date(iso + "T00:00:00");
  return Number.isNaN(d.getTime()) ? iso
    : d.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
}

async function renderAdmin(ctx, root){
  root.innerHTML = "";

  const h = document.createElement("h3");
  h.className = "admin-title";
  h.textContent = "GitHub token";

  const body = document.createElement("p");
  body.className = "mhelp";
  body.style.margin = "0 0 0.8rem";

  const date = await lock.tokenExpiry();
  const left = lock.daysUntil(date);

  if(!date){
    body.textContent = "The token that lets the scheduler fetch your news " +
      "expires. Set the date and this will remind you before it does.";
  }else if(left === null){
    body.textContent = "Renewal date: " + date;
  }else if(left < 0){
    body.textContent = "Expired " + Math.abs(left) +
      (Math.abs(left) === 1 ? " day" : " days") + " ago, on " + fmtDate(date) +
      ". The news has probably stopped updating.";
  }else if(left === 0){
    body.textContent = "Expires today, " + fmtDate(date) + ".";
  }else{
    body.textContent = "Renews " + fmtDate(date) + " \u2014 " + left +
      (left === 1 ? " day" : " days") + " away.";
  }

  if(left !== null && left <= 14) root.classList.add("admin-due");
  else root.classList.remove("admin-due");

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "reset-btn";
  btn.textContent = date ? "Change the date" : "Set the date";
  btn.addEventListener("click", () => openAdmin(ctx, root));

  root.append(h, body, btn);
}

async function openAdmin(ctx, root){
  const already = await lock.isSet();

  if(!already){
    const first = await askForCode({
      title: "Choose a passcode",
      body: "This keeps the setting from being changed by accident, or by " +
            "somebody else picking up the tablet.\n\n" +
            "It is never written into the app and never stored as text — " +
            "only a scrambled form of it is kept, which cannot be turned " +
            "back. That also means nobody can recover it for you, so choose " +
            "something you will remember.",
      confirmLabel: "Set passcode"
    });
    if(first === null) return;
    if(first.length < 4){
      toast("Use at least four characters", "warn");
      return;
    }
    await lock.setPasscode(first);
    toast("Passcode set", "done");
  }else{
    const given = await askForCode({
      title: "Passcode",
      body: "Enter the passcode you set for this setting.",
      confirmLabel: "Unlock"
    });
    if(given === null) return;
    if(!(await lock.check(given))){
      toast("That passcode does not match", "warn");
      return;
    }
  }

  await askForDate(ctx, root);
}

/* A small dialog with one field. Kept here rather than in ui.js
   because it is the only place that needs an input. */
function askForCode(opts){
  return askWithField({ ...opts, type: "password", placeholder: "" });
}

async function askForDate(ctx, root){
  const current = await lock.tokenExpiry();
  const value = await askWithField({
    title: "When does the token expire?",
    body: "GitHub shows the date when you create the token. A reminder " +
          "appears here two weeks before.",
    type: "date",
    value: current || "",
    confirmLabel: "Save"
  });
  if(value === null) return;

  await lock.setTokenExpiry(value || null);
  await renderAdmin(ctx, root);
  toast(value ? "Reminder set for " + fmtDate(value) : "Reminder cleared", "done");
}

function askWithField(opts){
  return new Promise(resolve => {
    const backdrop = document.createElement("div");
    backdrop.className = "sheet-backdrop";

    const sheet = document.createElement("div");
    sheet.className = "sheet";
    sheet.setAttribute("role", "dialog");
    sheet.setAttribute("aria-modal", "true");

    const h = document.createElement("h2");
    h.className = "sheet-title";
    h.textContent = opts.title;

    const p = document.createElement("p");
    p.className = "sheet-body";
    p.style.whiteSpace = "pre-line";
    p.textContent = opts.body || "";

    const input = document.createElement("input");
    input.type = opts.type || "text";
    input.className = "sheet-field";
    if(opts.value) input.value = opts.value;
    if(opts.type === "password"){
      input.autocomplete = "off";
      input.inputMode = "text";
    }

    const row = document.createElement("div");
    row.className = "sheet-row";

    const no = document.createElement("button");
    no.type = "button";
    no.className = "sheet-btn sheet-no";
    no.textContent = "Cancel";

    const yes = document.createElement("button");
    yes.type = "button";
    yes.className = "sheet-btn sheet-yes";
    yes.textContent = opts.confirmLabel || "Save";

    row.append(no, yes);
    sheet.append(h, p, input, row);
    backdrop.appendChild(sheet);
    document.body.appendChild(backdrop);

    const close = answer => {
      document.removeEventListener("keydown", onKey);
      backdrop.remove();
      resolve(answer);
    };
    const onKey = e => {
      if(e.key === "Escape") close(null);
      if(e.key === "Enter" && document.activeElement === input) close(input.value.trim());
    };

    onTap(no,  () => close(null));
    onTap(yes, () => close(input.value.trim()));
    backdrop.addEventListener("click", e => { if(e.target === backdrop) close(null); });
    document.addEventListener("keydown", onKey);

    window.requestAnimationFrame(() => {
      backdrop.classList.add("sheet-in");
      input.focus();
    });
  });
}
