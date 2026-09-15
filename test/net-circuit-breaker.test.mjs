import assert from "node:assert/strict";
import test from "node:test";

import { HostCircuitBreaker } from "../net.mjs";

test("a route opens after two HTTP 403 responses", () => {
  const breaker = new HostCircuitBreaker(2);
  const article = "https://newsinfo.inquirer.net/example";

  assert.equal(breaker.record(article, false, 403), false);
  assert.equal(breaker.isOpen(article, false), false);
  assert.equal(breaker.record(article, false, 403), true);
  assert.equal(breaker.isOpen(article, false), true);
});

test("direct and doorway circuits remain independent", () => {
  const breaker = new HostCircuitBreaker(2);
  const article = "https://newsinfo.inquirer.net/example";

  breaker.record(article, false, 403);
  breaker.record(article, false, 403);

  assert.equal(breaker.isOpen(article, false), true);
  assert.equal(breaker.isOpen(article, true), false);
});

test("a successful response clears a route's refusal count", () => {
  const breaker = new HostCircuitBreaker(2);
  const article = "https://newsinfo.inquirer.net/example";

  breaker.record(article, true, 403);
  breaker.record(article, true, 200);
  breaker.record(article, true, 403);

  assert.equal(breaker.isOpen(article, true), false);
});
