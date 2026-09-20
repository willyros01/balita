import assert from "node:assert/strict";
import test from "node:test";
import {
  ARTICLE_MAX_AGE_MS,
  HEADLINE_ONLY_MAX_AGE_MS,
  isWithinArticleRetention,
  isWithinHeadlineOnlyRetention
} from "../retention.mjs";

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

test("headline-only articles remain for exactly 24 hours", () => {
  assert.equal(isWithinHeadlineOnlyRetention({
    source_of_text: "summary",
    firstSeen: new Date(now - HEADLINE_ONLY_MAX_AGE_MS).toISOString()
  }, now), true);
});

test("headline-only articles expire after 24 hours", () => {
  assert.equal(isWithinHeadlineOnlyRetention({
    source_of_text: "summary",
    firstSeen: new Date(now - HEADLINE_ONLY_MAX_AGE_MS - 1).toISOString()
  }, now), false);
});

test("full articles keep the three-day retention rule", () => {
  assert.equal(isWithinHeadlineOnlyRetention({
    source_of_text: "page",
    firstSeen: new Date(now - HEADLINE_ONLY_MAX_AGE_MS - 1).toISOString()
  }, now), true);
});
