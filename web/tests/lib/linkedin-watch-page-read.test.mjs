import test from "node:test";
import assert from "node:assert/strict";
import { normalizeRawCards, detectHalt } from "../../src/lib/linkedin-watch/page-read.mjs";

test("normalizeRawCards builds a canonical link and drops bad ids", () => {
  const cards = normalizeRawCards([
    { jobId: "4001234567", title: " Backend Engineer ", company: "Acme", location: "Remote", posted: "2 minutes ago" },
    { jobId: "abc", title: "x" },
    { title: "no id" },
  ]);
  assert.equal(cards.length, 1);
  assert.equal(cards[0].id, "4001234567");
  assert.equal(cards[0].title, "Backend Engineer");
  assert.equal(cards[0].link, "https://www.linkedin.com/jobs/view/4001234567/");
});

test("detectHalt recognises each stop page", () => {
  const ok = { url: "https://www.linkedin.com/jobs/search/?keywords=x", title: "Jobs", bodyText: "Backend Engineer", status: 200 };
  assert.equal(detectHalt(ok), null);
  assert.equal(detectHalt({ ...ok, status: 429 }), "rate-limited");
  assert.equal(detectHalt({ ...ok, url: "https://www.linkedin.com/authwall?x=1" }), "login-wall");
  assert.equal(detectHalt({ ...ok, url: "https://www.linkedin.com/login" }), "login-wall");
  assert.equal(detectHalt({ ...ok, url: "https://www.linkedin.com/checkpoint/challenge/abc" }), "checkpoint");
  assert.equal(detectHalt({ ...ok, bodyText: "Let's do a quick security check" }), "captcha");
});
