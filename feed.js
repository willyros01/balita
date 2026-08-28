/* ============================================================
   feed.js — the source chips and the list of stories.

   Knows nothing about how a story is read or where feeds come
   from. It draws a list and calls back when something is tapped.
   ============================================================ */

/* ---------------- time ----------------
   "18 minutes ago" reads better than a timestamp when you are
   scanning, and it is one less thing to decipher. */
export function timeAgo(iso){
  if(!iso) return "";
  const then = new Date(iso).getTime();
  if(Number.isNaN(then)) return "";

  const mins = Math.round((Date.now() - then) / 60000);

  if(mins < 1)    return "just now";
  if(mins === 1)  return "1 minute ago";
  if(mins < 60)   return mins + " minutes ago";

  const hrs = Math.round(mins / 60);
  if(hrs === 1)   return "1 hour ago";
  if(hrs < 24)    return hrs + " hours ago";

  const days = Math.round(hrs / 24);
  if(days === 1)  return "yesterday";
  if(days < 7)    return days + " days ago";

  return new Date(then).toLocaleDateString(undefined, { month:"short", day:"numeric" });
}

/* ---------------- artwork ----------------
   A story with no picture gets a quiet shape rather than an empty
   grey box, so the row keeps its rhythm down the page. */
export function placeholder(seed, w, h){
  const n = Math.abs(seed | 0) % 6;
  const a = ["#8FA6B5","#B59E8F","#9BB58F","#A98FB5","#B58F9B","#8FB5AE"][n];
  const b = ["#4E6675","#75604E","#5B754E","#694E75","#754E5B","#4E756E"][n];
  const uid = "g" + n + "_" + w;

  return '<svg viewBox="0 0 ' + w + ' ' + h + '" role="img" ' +
    'aria-label="No photograph for this story" preserveAspectRatio="xMidYMid slice">' +
    '<defs><linearGradient id="' + uid + '" x1="0" y1="0" x2="1" y2="1">' +
    '<stop offset="0" stop-color="' + a + '"/>' +
    '<stop offset="1" stop-color="' + b + '"/></linearGradient></defs>' +
    '<rect width="' + w + '" height="' + h + '" fill="url(#' + uid + ')"/>' +
    '<circle cx="' + (w * 0.74) + '" cy="' + (h * 0.28) + '" r="' + (h * 0.13) + '" fill="#fff" opacity="0.28"/>' +
    '<path d="M0 ' + h + ' L' + (w * 0.3) + ' ' + (h * 0.45) +
      ' L' + (w * 0.55) + ' ' + (h * 0.78) +
      ' L' + (w * 0.78) + ' ' + (h * 0.5) +
      ' L' + w + ' ' + h + ' Z" fill="#000" opacity="0.22"/></svg>';
}

/* ---------------- chips ---------------- */

export function renderChips(ctx){
  const wrap = document.getElementById("chips");
  wrap.innerHTML = "";

  const add = (label, pressed, onTap, extra) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "chip" + (extra ? " " + extra : "");
    b.textContent = label;
    if(pressed !== null) b.setAttribute("aria-pressed", String(pressed));
    b.addEventListener("click", onTap);
    wrap.appendChild(b);
    return b;
  };

  add("All sources", ctx.state.filter === "ALL", () => {
    ctx.state.filter = "ALL";
    renderChips(ctx); renderFeed(ctx);
    ctx.announce("Showing all sources");
  });

  ctx.state.sources.filter(s => s.on).forEach(s => {
    add(s.name, ctx.state.filter === s.id, () => {
      ctx.state.filter = s.id;
      renderChips(ctx); renderFeed(ctx);
      ctx.announce("Showing " + s.name);
    });
  });

  add("+ Sources", null, ctx.openSources, "chip-add");
}

/* ---------------- the list ---------------- */

export function renderFeed(ctx){
  const listEl    = document.getElementById("feed");
  const countEl   = document.getElementById("count");
  const updatedEl = document.getElementById("updated");

  const live  = ctx.state.sources.filter(s => s.on).map(s => s.id);
  const items = ctx.state.articles
    .filter(a => live.includes(a.source))
    .filter(a => ctx.state.filter === "ALL" || a.source === ctx.state.filter)
    .sort((x, y) => new Date(y.published) - new Date(x.published));

  countEl.textContent = items.length + (items.length === 1 ? " story" : " stories");

  updatedEl.textContent = ctx.state.updated
    ? "Updated " + new Date(ctx.state.updated).toLocaleTimeString(undefined, { hour:"numeric", minute:"2-digit" })
    : "";

  listEl.innerHTML = "";

  if(!items.length){
    const li = document.createElement("li");
    li.className = "empty";
    li.textContent = ctx.state.articles.length
      ? "Nothing from this source yet. Try another, or add one."
      : "No stories yet. Pull down to refresh, or check your connection.";
    listEl.appendChild(li);
    return;
  }

  items.forEach((a, i) => {
    const src = ctx.sourceOf(a.source);
    if(!src) return;

    const li = document.createElement("li");
    li.className = "card";
    li.style.setProperty("--spine", src.color);

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "card-btn";
    btn.addEventListener("click", () => ctx.openArticle(a.id));

    /* text side */
    const text = document.createElement("div");
    text.className = "card-text";

    const meta = document.createElement("p");
    meta.className = "meta";

    const tag = document.createElement("span");
    tag.className = "tag";
    tag.textContent = src.tag;
    meta.appendChild(tag);

    [a.section, timeAgo(a.published)].filter(Boolean).forEach(bit => {
      const dot = document.createElement("span");
      dot.className = "dot";
      dot.setAttribute("aria-hidden", "true");
      dot.textContent = "\u00B7";
      const sp = document.createElement("span");
      sp.textContent = bit;
      meta.append(dot, sp);
    });

    /* Say up front when a story did not come through whole, so the
       shortfall is known before tapping rather than after. */
    if(a.source_of_text === "summary" || a.truncated){
      const flag = document.createElement("span");
      flag.className = "flag";
      flag.textContent = a.source_of_text === "summary" ? "Headline only" : "Cut short";
      meta.appendChild(flag);
    }

    const h = document.createElement("h2");
    h.className = "headline";
    h.textContent = a.title;

    const sf = document.createElement("p");
    sf.className = "standfirst";
    sf.textContent = a.summary || "";

    text.append(meta, h);
    if(a.summary) text.appendChild(sf);

    /* picture side */
    const thumb = document.createElement("div");
    thumb.className = "thumb";
    thumb.setAttribute("aria-hidden", "true");

    if(a.image && a.image.src){
      const img = document.createElement("img");
      img.src = a.image.src;
      img.alt = "";
      img.loading = "lazy";
      img.decoding = "async";
      /* A picture that will not load should not leave a hole. */
      img.addEventListener("error", () => { thumb.innerHTML = placeholder(i, 100, 100); });
      thumb.appendChild(img);
    }else{
      thumb.innerHTML = placeholder(i, 100, 100);
    }

    btn.append(text, thumb);
    li.appendChild(btn);
    listEl.appendChild(li);
  });
}
