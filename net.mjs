/* ============================================================
   net.mjs — one place for every outbound request.

   Being a good guest matters here. We identify ourselves, we
   wait rather than hammer, and we give up quickly on anything
   that is not responding.
   ============================================================ */

/* Identify as a browser. Not a trick — the request is genuinely on
   behalf of one person reading a public page. But a great many sites
   reject anything whose user-agent is not a recognised browser, and
   Inquirer was refusing roughly two thirds of its own articles on
   that basis alone. */
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
           "AppleWebKit/537.36 (KHTML, like Gecko) " +
           "Chrome/126.0.0.0 Safari/537.36";

/* Feeds are worth waiting for — there are only a handful and one
   failure costs a whole outlet. Article pages are not: there are
   dozens, many will never answer, and a page that has not replied
   in eight seconds is almost never going to. Retrying those was
   what turned a two-minute run into eight. */
const TIMEOUT_MS = 12000;
const RETRIES    = 2;
/* Ten article pages from one outlet inside three seconds reads as
   scraping to any rate limiter, and the refusals that followed were
   the result. A couple of seconds between requests to the same host
   is ordinary reading pace, and the run still finishes in about a
   minute because different outlets are fetched in parallel. */
const GAP_MS     = 1800;

const lastHit = new Map();

/* Some hosts want more room than the general pace. newsinfo refuses
   everything at 1.8s while globalnation, on the same publisher's
   infrastructure, is perfectly happy. */
const HOST_GAP = {
  /* newsinfo refuses every article page whatever the pacing — six
     seconds made no difference at all, and cost four minutes a run.
     Left at the ordinary rate; it is kept for its headlines. */
};

/* Cookies, kept per host for the life of a run.

   A filter that turns away every request will often admit one that
   looks like it arrived through the site: it has a cookie from an
   earlier visit and a referrer naming the page it came from. We
   fetch the section page once, keep whatever it hands back, and
   carry it on the article requests. Nothing is stored between runs
   and nothing identifies anybody. */
const jar = new Map();
const warmed = new Set();

function remember(host, res){
  let cookies = [];
  try{
    cookies = typeof res.headers.getSetCookie === "function"
      ? res.headers.getSetCookie()
      : [res.headers.get("set-cookie")].filter(Boolean);
  }catch(e){ return; }

  if(!cookies.length) return;

  const existing = new Map(
    (jar.get(host) || "").split("; ").filter(Boolean)
      .map(p => [p.slice(0, p.indexOf("=")), p.slice(p.indexOf("=") + 1)])
  );

  for(const line of cookies){
    const pair = String(line).split(";")[0];
    const eq = pair.indexOf("=");
    if(eq > 0) existing.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
  }

  jar.set(host, [...existing].map(([k, v]) => k + "=" + v).join("; "));
}

/* Visit a host's front page once, so later requests arrive with a
   cookie rather than out of nowhere. Failure is not important — it
   is an attempt to be a better guest, not a requirement. */
export async function warmUp(url){
  let host, origin;
  try{
    const u = new URL(url);
    host = u.host; origin = u.origin;
  }catch(e){ return; }

  if(warmed.has(host)) return;
  warmed.add(host);

  try{
    await get(origin + "/", {
      accept: "text/html,application/xhtml+xml",
      timeout: 8000,
      retries: 0,
      noWarm: true
    });
  }catch(err){
    /* nothing to do; the articles will simply try without a cookie */
  }
}

function sleep(ms){
  return new Promise(r => setTimeout(r, ms));
}

/* Never more than one request per host per GAP_MS.

   The slot has to be claimed before sleeping, not after. Measuring
   the gap and then waiting looks correct but collapses the moment
   more than one worker is running: eight of them read the same
   "last request" time, all wait the same interval, and all fire
   together — which is exactly the burst the gap exists to prevent.
   Reserving the next slot up front makes them queue instead. */
async function pace(url){
  let host;
  try{ host = new URL(url).host; }catch(e){ return; }

  const gap  = HOST_GAP[host] || GAP_MS;
  const now  = Date.now();
  const slot = Math.max(now, (lastHit.get(host) || 0) + gap);
  lastHit.set(host, slot);

  if(slot > now) await sleep(slot - now);
}

/* Returns { url, status, body, contentType } or throws. */
export async function get(url, opts = {}){
  const attempts = opts.retries ?? RETRIES;
  let lastErr;

  for(let i = 0; i <= attempts; i++){
    if(i > 0) await sleep(700 * i);
    await pace(url);

    const ctrl  = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), opts.timeout ?? TIMEOUT_MS);

    try{
      let host = "";
      try{ host = new URL(url).host; }catch(e){}

      const headers = {
          "user-agent": UA,
          "accept": opts.accept ||
            "application/rss+xml, application/atom+xml, application/xml;q=0.9, text/html;q=0.8, */*;q=0.5",
          "accept-language": "en-US,en;q=0.9",
          /* A browser sends these. Their absence is one of the
             cheapest signals a filter can check for. */
          "accept-encoding": "gzip, deflate, br",
          "sec-fetch-dest": "document",
          "sec-fetch-mode": "navigate",
          "sec-fetch-site": opts.referer ? "same-origin" : "none",
          "upgrade-insecure-requests": "1"
      };

      if(opts.referer) headers["referer"] = opts.referer;
      if(jar.has(host)) headers["cookie"] = jar.get(host);

      const res = await fetch(url, {
        redirect: "follow",
        signal: ctrl.signal,
        headers
      });

      clearTimeout(timer);
      remember(host, res);

      /* A 403 is worth one more try after a pause: when it comes from
         a rate limiter rather than a policy, waiting is the whole
         remedy. 401, 404 and 410 are settled answers. */
      if(res.status === 403 && i < attempts){
        await sleep(3000 + i * 2000);
        lastErr = new Error("HTTP 403");
        continue;
      }

      if(res.status === 401 || res.status === 403 || res.status === 404 || res.status === 410){
        return {
          url: res.url || url,
          status: res.status,
          body: "",
          contentType: res.headers.get("content-type") || ""
        };
      }

      if(!res.ok) throw new Error("HTTP " + res.status);

      return {
        url: res.url || url,
        status: res.status,
        body: await res.text(),
        contentType: res.headers.get("content-type") || ""
      };

    }catch(err){
      clearTimeout(timer);
      /* AbortError just means our own timer fired. Say so plainly —
         "timed out" and "refused the connection" want different fixes. */
      lastErr = (err && err.name === "AbortError")
        ? new Error("timed out after " + Math.round((opts.timeout ?? TIMEOUT_MS) / 1000) + "s")
        : err;
    }
  }

  throw lastErr || new Error("request failed");
}

/* Run jobs a few at a time. Sequential is too slow across a dozen
   feeds; unlimited is rude and gets you blocked. */
export async function pool(items, limit, worker){
  const out = new Array(items.length);
  let next = 0;

  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while(true){
      const i = next++;
      if(i >= items.length) return;
      try{
        out[i] = await worker(items[i], i);
      }catch(err){
        out[i] = { error: err };
      }
    }
  });

  await Promise.all(runners);
  return out;
}
