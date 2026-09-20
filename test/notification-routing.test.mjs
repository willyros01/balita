import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const workerSource = await readFile(new URL("../sw.js", import.meta.url), "utf8");
const appSource = await readFile(new URL("../app.js", import.meta.url), "utf8");
const feedSource = await readFile(new URL("../feed.js", import.meta.url), "utf8");
const readerSource = await readFile(new URL("../reader.js", import.meta.url), "utf8");
const fetcherSource = await readFile(new URL("../fetch-feeds.mjs", import.meta.url), "utf8");
const notifierSource = await readFile(new URL("../breaking-notify.mjs", import.meta.url), "utf8");
const notificationsSource = await readFile(new URL("../notifications.js", import.meta.url), "utf8");

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

test("a background notification waits for the existing app to foreground", async () => {
  const order = [];
  const client = {
    url: "https://example.test/balita/",
    focus: async () => { order.push("focused"); },
    navigate: async url => { order.push("navigate:" + url); return client; },
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
      data: {
        articleId: "inq-test",
        path: "?article=inq-test",
        sentAt: "2026-09-20T12:00:00.000Z"
      },
      close() {}
    },
    waitUntil(promise){ completion = promise; }
  });
  await completion;

  assert.equal(order[0], "route-saved");
  assert.equal(order[1], "focused");
  assert.ok(!order.includes("open:https://example.test/balita/?article=inq-test"));
  assert.ok(!order.includes("navigate:https://example.test/balita/?article=inq-test"));
  assert.equal(order.filter(item => item === "message:inq-test").length, 5);
  const saved = [...harness.records.values()].map(JSON.parse)[0];
  assert.equal(saved.articleId, "inq-test");
  assert.equal(saved.sentAt, "2026-09-20T12:00:00.000Z");
});

test("a cold notification saves its route before opening Wire", async () => {
  const harness = workerHarness();
  let completion;
  harness.listeners.get("notificationclick")({
    notification: {
      data: {
        articleId: "inq-cold",
        path: "?article=inq-cold",
        sentAt: "2026-09-20T12:00:00.000Z"
      },
      close() {}
    },
    waitUntil(promise){ completion = promise; }
  });
  await completion;

  assert.deepEqual(harness.order, [
    "route-saved",
    "open:https://example.test/balita/?article=inq-cold"
  ]);
  const saved = [...harness.records.values()].map(JSON.parse)[0];
  assert.equal(saved.sentAt, "2026-09-20T12:00:00.000Z");
});

test("service-worker activation preserves a pending notification route", async () => {
  const harness = workerHarness();
  let completion;
  harness.listeners.get("activate")({ waitUntil(promise){ completion = promise; } });
  await completion;

  assert.deepEqual(harness.order, ["delete:wire-v0.17.2"]);
});

test("notification delivery and routing expire after one fetch cycle", async () => {
  assert.match(notifierSource, /TTL: "1800"/);
  assert.match(notifierSource, /sentAt/);
  assert.match(workerSource, /NOTIFICATION_MAX_AGE_MS = 30 \* 60 \* 1000/);
  assert.match(workerSource, /Date\.now\(\) - sentAtMs > NOTIFICATION_MAX_AGE_MS/);
  assert.match(appSource, /Date\.now\(\) - sentAt > NOTIFICATION_ROUTE_MAX_AGE_MS/);
  assert.match(appSource, /This notification has expired\. Showing current headlines\./);
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
  assert.match(appSource, /NOTIFICATION_ROUTE_MAX_AGE_MS = 30 \* 60 \* 1000/);
  assert.doesNotMatch(appSource, /document\.visibilityState === "hidden"/);
  assert.match(appSource, /Date\.now\(\) - sentAt > NOTIFICATION_ROUTE_MAX_AGE_MS/);
  assert.match(appSource, /return \{ articleId, sentAt, cache, request \}/);
  assert.match(appSource, /await expireNotificationArticle\(articleId\)/);
  assert.doesNotMatch(appSource, /feedUpdatedAt > clickedAt/);
  assert.match(workerSource, /self\.clients\.openWindow\(target\.href\)/);
  assert.match(workerSource, /client\.postMessage\(/);
  assert.match(workerSource, /for\(const delay of \[0, 500, 1000, 1500, 2000\]\)/);
  assert.match(feedSource, /li\.dataset\.articleId = a\.id/);
  assert.match(readerSource, /returnSource\.name \+ " headlines"/);
  assert.match(fetcherSource, /ARTICLE_DIR \+ "\/" \+ article\.id \+ "\.json"/);
  assert.match(fetcherSource, /isWithinArticleRetention\(a\.published\)/);
  assert.match(fetcherSource, /article pages still use doorway/);
  assert.doesNotMatch(notificationsSource, /No test push has reached Wire/);
  assert.match(notificationsSource, /Notifications are on\./);
  assert.match(notificationsSource, /Notifications are off\./);
});

test("the workflow publishes articles before sending their notifications", async () => {
  const workflow = await readFile(new URL("../.github/workflows/feeds.yml", import.meta.url), "utf8");
  const publish = workflow.indexOf("name: Publish fetched stories before alerts");
  const notify = workflow.indexOf("name: Send tightly limited breaking-news alerts");
  assert.ok(publish > 0 && notify > publish);
  assert.match(workflow, /git status --porcelain -- articles\.json articles\//);
  assert.match(workflow, /git diff --quiet breaking-state\.json/);
});

test("the established Inquirer doorway and freshness routing remains intact", async () => {
  const netSource = await readFile(new URL("../net.mjs", import.meta.url), "utf8");

  assert.match(netSource, /"newsinfo\.inquirer\.net"/);
  assert.match(netSource, /"www\.inquirer\.net"/);
  assert.match(netSource, /"globalnation\.inquirer\.net"/);
  assert.match(netSource, /"business\.inquirer\.net"/);
  assert.doesNotMatch(netSource, /"mb\.com\.ph"/);
  assert.match(fetcherSource, /INQUIRER_SOURCE_IDS\.has\(source\.id\)/);
  assert.match(fetcherSource, /noDoor:\s*true/);
  assert.ok(fetcherSource.indexOf("res = await get(feedUrl, { accept:") <
    fetcherSource.indexOf("noDoor: true"));
  assert.match(fetcherSource, /newest\(directItems\) > newest\(doorwayItems\)/);
  assert.match(fetcherSource, /have\.source_of_text === "summary"/);
  assert.match(fetcherSource, /source\.id !== "abs"/);
  assert.match(fetcherSource, /!retryIncomplete/);
  assert.match(fetcherSource, /retries: recovery \? 0 : PAGE_RETRIES/);
  assert.match(fetcherSource, /a\.source_of_text === "summary" && a\.url/);
  assert.match(fetcherSource, /name: "direct"/);
  assert.match(fetcherSource, /name: "doorway"/);
  assert.match(fetcherSource, /circuitBreaker: true/);
  assert.match(fetcherSource, /preserveBestText\(byId\.get\(a\.id\), a\)/);
  assert.match(fetcherSource, /candidate\.source_of_text === "summary"/);
  assert.ok(fetcherSource.indexOf('name: "doorway"') <
    fetcherSource.indexOf('name: "direct"'));
  assert.match(netSource,
    /await pace\(url\);[\s\S]*?hostCircuit\.isOpen\(url, viaDoor\)/);
});
