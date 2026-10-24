/* Wait for GitHub Pages to serve the exact feed and article files before
 * offering a push notification that links to them. A successful git push is
 * not proof that the public Pages deployment has finished. */
import { readFile } from "node:fs/promises";

const PUBLIC_ROOT = "https://willyros01.github.io/balita/";
const MAX_WAIT_MS = 8 * 60 * 1000;
const RETRY_MS = 12 * 1000;
const REQUEST_TIMEOUT_MS = 8 * 1000;

export async function waitForPublishedArticles(articleIds, {
  publicRoot = PUBLIC_ROOT,
  readText = path => readFile(path, "utf8"),
  request = fetch,
  clock = () => Date.now(),
  pause = ms => new Promise(resolve => setTimeout(resolve, ms)),
  maxWaitMs = MAX_WAIT_MS,
  retryMs = RETRY_MS,
  requestTimeoutMs = REQUEST_TIMEOUT_MS,
  log = message => console.log(message)
} = {}) {
  if (!Array.isArray(articleIds)) throw new TypeError("Article IDs must be an array.");
  const ids = [...new Set(articleIds)];
  if (!ids.length) return { attempts: 0, elapsedMs: 0 };
  // IDs come from the fetcher; still reject path traversal or query syntax.
  if (ids.some(id => typeof id !== "string" || !/^[a-z0-9][a-z0-9-]{0,99}$/.test(id))) {
    throw new Error("Refusing to check an invalid article ID.");
  }

  const root = new URL(publicRoot);
  if (root.protocol !== "https:") throw new Error("Publication checks require HTTPS.");
  const paths = ["articles.json", ...ids.map(id => `articles/${id}.json`)];
  const expected = new Map(await Promise.all(paths.map(async path => [path, await readText(path)])));
  const start = clock();
  let attempt = 0;
  let lastReason = "not checked";

  async function check(path) {
    const url = new URL(path, root);
    url.searchParams.set("wire_publication_check", `${start}-${attempt}`);
    try {
      const response = await request(url.toString(), {
        cache: "no-store",
        signal: AbortSignal.timeout(requestTimeoutMs)
      });
      if (!response.ok) return `${path}: HTTP ${response.status}`;
      if (await response.text() !== expected.get(path)) return `${path}: old content`;
      return null;
    } catch (_) {
      return `${path}: temporarily unreachable`;
    }
  }

  while (true) {
    attempt++;
    lastReason = await check("articles.json");
    if (!lastReason) {
      const problems = await Promise.all(paths.slice(1).map(check));
      lastReason = problems.find(Boolean) || "";
    }
    if (!lastReason) {
      const elapsedMs = clock() - start;
      log(`Live GitHub Pages publication verified for ${ids.length} article(s) after ${attempt} check(s), ${Math.ceil(elapsedMs / 1000)}s.`);
      return { attempts: attempt, elapsedMs };
    }
    const remaining = maxWaitMs - (clock() - start);
    if (remaining <= 0) {
      throw new Error(`Live publication not verified after ${attempt} check(s) (${lastReason}); no notification sent. Next scheduled run can retry.`);
    }
    await pause(Math.min(retryMs, remaining));
  }
}
