import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { waitForPublishedArticles } from "./publication-ready.mjs";

const files = {
  "articles.json": '{"articles":[{"id":"dw-123"}]}\n',
  "articles/dw-123.json": '{"id":"dw-123","title":"Live: News"}\n',
  "articles/bbc-456.json": '{"id":"bbc-456","title":"Breaking: News"}\n'
};

function harness(responder, extra = {}) {
  let now = 1000;
  const calls = [];
  const logs = [];
  return {
    calls, logs,
    options: {
      readText: async path => files[path],
      request: async url => {
        const parsed = new URL(url);
        const path = parsed.pathname.replace(/^\/balita\//, "");
        calls.push({ path, bust: parsed.searchParams.get("wire_publication_check") });
        return responder(path, calls.length);
      },
      clock: () => now,
      pause: async ms => { now += ms; },
      maxWaitMs: 3000,
      retryMs: 1000,
      log: line => logs.push(line),
      ...extra
    }
  };
}
const response = (value, status = 200) => new Response(value, { status });
const ready = path => response(files[path]);

test("immediate publication checks both the feed and exact article", async () => {
  const h = harness(ready);
  const result = await waitForPublishedArticles(["dw-123"], h.options);
  assert.equal(result.attempts, 1);
  assert.deepEqual(h.calls.map(c => c.path), ["articles.json", "articles/dw-123.json"]);
  assert.match(h.logs[0], /verified/);
});

test("stale public feed delays all article checks until current", async () => {
  let feeds = 0;
  const h = harness(path => path === "articles.json" && ++feeds < 3
    ? response('{"old":true}\n') : ready(path));
  const result = await waitForPublishedArticles(["dw-123"], h.options);
  assert.equal(result.attempts, 3);
  assert.equal(h.calls.filter(c => c.path === "articles/dw-123.json").length, 1);
  assert.equal(new Set(h.calls.map(c => c.bust)).size, 3);
});

test("article endpoint HTTP 404 delays delivery even after feed is live", async () => {
  let articles = 0;
  const h = harness(path => path === "articles/dw-123.json" && ++articles < 2
    ? response("missing", 404) : ready(path));
  assert.equal((await waitForPublishedArticles(["dw-123"], h.options)).attempts, 2);
});

test("same article ID with stale body delays delivery", async () => {
  let articles = 0;
  const h = harness(path => path === "articles/dw-123.json" && ++articles < 2
    ? response('{"id":"dw-123","title":"Old"}\n') : ready(path));
  assert.equal((await waitForPublishedArticles(["dw-123"], h.options)).attempts, 2);
});

test("temporary HTTP and network errors retry safely", async () => {
  let tries = 0;
  const h = harness(path => {
    if (path !== "articles.json") return ready(path);
    tries++;
    if (tries === 1) throw new Error("connection reset");
    if (tries === 2) return response("unavailable", 503);
    return ready(path);
  });
  assert.equal((await waitForPublishedArticles(["dw-123"], h.options)).attempts, 3);
});

test("permanent stale publication fails closed without a success log", async () => {
  const h = harness(() => response("stale"));
  await assert.rejects(waitForPublishedArticles(["dw-123"], h.options), /no notification sent/);
  assert.equal(h.logs.length, 0);
  assert.equal(h.calls.length, 4);
});

test("multiple targets all require exact public content", async () => {
  let bbcChecks = 0;
  const h = harness(path => path === "articles/bbc-456.json" && ++bbcChecks === 1
    ? response("not yet", 404) : ready(path));
  assert.equal((await waitForPublishedArticles(["dw-123", "bbc-456"], h.options)).attempts, 2);
  assert.equal(h.calls.filter(c => c.path === "articles/bbc-456.json").length, 2);
});

test("empty selection does no I/O; repeated IDs are checked once", async () => {
  const h = harness(ready);
  assert.equal((await waitForPublishedArticles([], h.options)).attempts, 0);
  assert.equal(h.calls.length, 0);
  await waitForPublishedArticles(["dw-123", "dw-123"], h.options);
  assert.equal(h.calls.filter(c => c.path === "articles/dw-123.json").length, 1);
});

test("invalid IDs and non-HTTPS endpoints are refused", async () => {
  const h = harness(ready);
  await assert.rejects(waitForPublishedArticles(["../secrets"], h.options), /invalid article ID/);
  await assert.rejects(waitForPublishedArticles(["dw-123"], { ...h.options, publicRoot: "http://example.org/" }), /HTTPS/);
  assert.equal(h.calls.length, 0);
});

test("sender waits before first push and before persisting seen IDs", async () => {
  const sender = await readFile(new URL("./breaking-notify.mjs", import.meta.url), "utf8");
  const gate = sender.indexOf("await waitForPublishedArticles(selected.map(article => article.id))");
  const sendLoop = sender.indexOf("for(const article of selected){", gate);
  const saveAfterSend = sender.indexOf("await saveState(state);", sendLoop);
  assert.ok(gate > 0 && sendLoop > gate && saveAfterSend > sendLoop);
});
