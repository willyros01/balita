import assert from "node:assert/strict";
import test from "node:test";
import { ARTICLE_MAX_AGE_MS, isWithinArticleRetention } from "../retention.mjs";

const now = Date.parse("2026-09-19T12:00:00.000Z");

test("articles remain available for exactly three days", () => {
  assert.equal(isWithinArticleRetention(
    new Date(now - ARTICLE_MAX_AGE_MS).toISOString(), now
  ), true);
});

test("articles older than three days expire", () => {
  assert.equal(isWithinArticleRetention(
    new Date(now - ARTICLE_MAX_AGE_MS - 1).toISOString(), now
  ), false);
});

test("an undated publisher item is not discarded before normalization", () => {
  assert.equal(isWithinArticleRetention("", now), true);
});
