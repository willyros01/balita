import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const workerSource = await readFile(new URL("../sw.js", import.meta.url), "utf8");
const appSource = await readFile(new URL("../app.js", import.meta.url), "utf8");
const feedSource = await readFile(new URL("../feed.js", import.meta.url), "utf8");
const readerSource = await readFile(new URL("../reader.js", import.meta.url), "utf8");
const fetcherSource = await readFile(new URL("../fetch-feeds.mjs", import.meta.url), "utf8");

function workerHarness({ windows = [], openedClient = null } = {}){
  const listeners = new Map();
  const records = new Map();
  const order = [];
  const cache = {
    add: async () => {},
    put: async (key, response) => {
      order.push("route-saved");
      records.set(String(key), await response.clone().text());
    },
    match: async key => records.get(String(key)),
    keys: async () => [...records.keys()].map(url => new Request(url)),
    delete: async key => records.delete(String(key))
  };
  const self = {
    registration: {
      scope: "https://example.test/balita/",
      showNotification: async () => {}
    },
    location: { origin: "https://example.test" },
    clients: {
      claim: async () => {},
      matchAll: async () => windows,
      openWindow: async url => {
        order.push("open:" + url);
        return openedClient;
      }
    },
    addEventListener: (name, handler) => listeners.set(name, handler),
    skipWaiting: async () => {}
  };
  const caches = {
    open: async () => cache,
    keys: async () => ["wire-v0.17.2", "wire-notification-route-v1"],
    delete: async key => {
      order.push("delete:" + key);
      return true;
    },
    match: async () => null
  };

  vm.runInNewContext(workerSource, {
    self, caches, URL, Response, Promise,
    setTimeout: callback => { callback(); return 0; }
  });

  return { listeners, records, order };
}

test("a background notification uses the proven browser launch route", async () => {
  const order = [];
  const client = {
    url: "https://example.test/balita/",
    focus: async () => { order.push("focused"); },
    postMessage: message => order.push("message:" + message.articleId)
  };
  const harness = workerHarness({ windows: [client], openedClient: client });
  const originalPush = harness.order.push.bind(harness.order);
  harness.order.push = value => {
    order.push(value);
    return originalPush(value);
  };

  let completion;
  harness.listeners.get("notificationclick")({
    notification: {
      data: { articleId: "inq-test", path: "?article=inq-test" },
      close() {}
    },
    waitUntil(promise){ completion = promise; }
  });
  await completion;

  assert.equal(order[0], "route-saved");
  assert.ok(order.indexOf("message:inq-test") <
    order.indexOf("open:https://example.test/balita/?article=inq-test"));
  assert.ok(order.includes("focused"));
  assert.equal(order.filter(item => item === "message:inq-test").length, 6);
  const saved = [...harness.records.values()].map(JSON.parse)[0];
  assert.equal(saved.articleId, "inq-test");
});

test("service-worker activation preserves a pending notification route", async () => {
  const harness = workerHarness();
  let completion;
  harness.listeners.get("activate")({ waitUntil(promise){ completion = promise; } });
  await completion;

  assert.deepEqual(harness.order, ["delete:wire-v0.17.2"]);
});

test("the page recovers routes on startup and every iOS resume signal", () => {
  assert.match(appSource, /void recoverNotificationArticle\(\);/);
  assert.match(appSource, /addEventListener\("pageshow"/);
  assert.match(appSource, /addEventListener\("focus"/);
  assert.match(appSource, /addEventListener\("visibilitychange"/);
  assert.match(appSource, /await clearNotificationArticle\(articleId\)/);
  assert.match(appSource, /const requests = await cache\.keys\(\)/);
  assert.doesNotMatch(appSource, /NOTIFICATION_ROUTE_URL/);
  assert.match(appSource, /await loadArticles\(true\)/);
  assert.match(appSource, /retryNotificationArticle\(articleId\)/);
  assert.doesNotMatch(appSource, /That story is no longer in the current feed/);
  assert.match(appSource, /"articles\/" \+ encodeURIComponent\(articleId\)/);
  assert.match(appSource, /prepareNotificationReturn\(article\)/);
  assert.match(appSource, /window\.setInterval\(async \(\) =>/);
  assert.match(appSource, /notificationHeartbeatBusy/);
  assert.match(workerSource, /const existing = await broadcast\(\)/);
  assert.match(workerSource, /await broadcast\(\)/);
  assert.match(feedSource, /li\.dataset\.articleId = a\.id/);
  assert.match(readerSource, /returnSource\.name \+ " headlines"/);
  assert.match(fetcherSource, /ARTICLE_DIR \+ "\/" \+ article\.id \+ "\.json"/);
  assert.match(fetcherSource, /article pages still use doorway/);
});

test("the workflow publishes articles before sending their notifications", async () => {
  const workflow = await readFile(new URL("../.github/workflows/feeds.yml", import.meta.url), "utf8");
  const publish = workflow.indexOf("name: Publish fetched stories before alerts");
  const notify = workflow.indexOf("name: Send tightly limited breaking-news alerts");
  assert.ok(publish > 0 && notify > publish);
  assert.match(workflow, /git status --porcelain -- articles\.json articles\//);
  assert.match(workflow, /git diff --quiet breaking-state\.json/);
});

test("all three Inquirer feeds use doorway-first freshness routing", async () => {
  const netSource = await readFile(new URL("../net.mjs", import.meta.url), "utf8");

  assert.match(netSource, /"newsinfo\.inquirer\.net"/);
  assert.match(netSource, /"www\.inquirer\.net"/);
  assert.match(netSource, /"globalnation\.inquirer\.net"/);
  assert.doesNotMatch(netSource, /"mb\.com\.ph"/);
  assert.match(fetcherSource, /INQUIRER_SOURCE_IDS\.has\(source\.id\)/);
  assert.match(fetcherSource, /noDoor:\s*true/);
  assert.ok(fetcherSource.indexOf("res = await get(feedUrl, { accept:") <
    fetcherSource.indexOf("noDoor: true"));
  assert.match(fetcherSource, /newest\(directItems\) > newest\(doorwayItems\)/);
  assert.match(fetcherSource, /have\.source_of_text === "summary"/);
  assert.match(fetcherSource, /INQUIRER_RETRY_PER_SOURCE = 2/);
  assert.match(fetcherSource, /incompleteRetryRemaining--/);
  assert.match(fetcherSource, /!retryIncompleteInquirer/);
});
