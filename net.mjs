/* ============================================================
   net.mjs — one place for every outbound request.

   Being a good guest matters here. We identify ourselves, we
   wait rather than hammer, and we give up quickly on anything
   that is not responding.
   ============================================================ */

const UA = "Wire/0.5 (personal news reader)";

/* Feeds are worth waiting for — there are only a handful and one
   failure costs a whole outlet. Article pages are not: there are
   dozens, many will never answer, and a page that has not replied
   in eight seconds is almost never going to. Retrying those was
   what turned a two-minute run into eight. */
const TIMEOUT_MS = 12000;
const RETRIES    = 2;
const GAP_MS     = 250;   /* minimum spacing between requests to one host */

const lastHit = new Map();

function sleep(ms){
  return new Promise(r => setTimeout(r, ms));
}

/* Never more than one request per host per GAP_MS. */
async function pace(url){
  let host;
  try{ host = new URL(url).host; }catch(e){ return; }

  const last = lastHit.get(host) || 0;
  const wait = GAP_MS - (Date.now() - last);
  if(wait > 0) await sleep(wait);
  lastHit.set(host, Date.now());
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
      const res = await fetch(url, {
        redirect: "follow",
        signal: ctrl.signal,
        headers: {
          "user-agent": UA,
          "accept": opts.accept ||
            "application/rss+xml, application/atom+xml, application/xml;q=0.9, text/html;q=0.8, */*;q=0.5",
          "accept-language": "en"
        }
      });

      clearTimeout(timer);

      /* Do not retry a refusal — the answer will not change. */
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
