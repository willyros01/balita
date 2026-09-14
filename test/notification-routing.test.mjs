import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const workerSource = await readFile(new URL("../sw.js", import.meta.url), "utf8");
const appSource = await readFile(new URL("../app.js", import.meta.url), "utf8");

function workerHarness({ windows = [] } = {}){
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
      openWindow: async () => null
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

test("a background notification saves, navigates and then focuses the app", async () => {
  const order = [];
  const client = {
    url: "https://example.test/balita/",
    navigate: async url => {
      order.push("navigate:" + url);
      return client;
    },
    focus: async () => { order.push("focused"); },
    postMessage: message => order.push("message:" + message.articleId)
  };
  const harness = workerHarness({ windows: [client] });
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

  assert.deepEqual(order, [
    "route-saved",
    "navigate:https://example.test/balita/?article=inq-test",
    "focused",
    "message:inq-test",
    "message:inq-test",
    "message:inq-test"
  ]);
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

test("the page recovers routes on startup and both iOS resume signals", () => {
  assert.match(appSource, /void recoverNotificationArticle\(\);/);
  assert.match(appSource, /addEventListener\("pageshow"/);
  assert.match(appSource, /addEventListener\("visibilitychange"/);
  assert.match(appSource, /await clearNotificationArticle\(articleId\)/);
  assert.match(appSource, /const requests = await cache\.keys\(\)/);
  assert.doesNotMatch(appSource, /NOTIFICATION_ROUTE_URL/);
});
