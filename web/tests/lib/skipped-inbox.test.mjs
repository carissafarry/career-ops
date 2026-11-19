// Skipped inbox postings are counted apart from the tracker, so Analytics can
// show them without changing the funnel's "Tracked" number.
//
// Run: node --experimental-strip-types --test tests/lib/skipped-inbox.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { skippedInbox, skippedSummary } from "../../src/lib/skipped-inbox.mjs";

const row = (url, over = {}) => ({ url, company: "Acme", role: "Dev", done: true, ...over });

test("only checked-off rows with no tracker row count as skipped", () => {
  const inbox = [
    row("https://a.test/job/1"),
    row("https://a.test/job/2"),
    row("https://a.test/job/3", { done: false }),
    row("https://b.test/job/9"),
  ];
  const tracked = [{ url: "https://b.test/job/9" }];
  assert.deepEqual(skippedInbox(inbox, tracked).map((j) => j.url), ["https://a.test/job/1", "https://a.test/job/2"]);
});

test("a posting listed twice counts once", () => {
  const inbox = [row("https://a.test/job/1"), row("https://a.test/job/1")];
  assert.equal(skippedInbox(inbox, []).length, 1);
});

test("the summary gives the share of everything reviewed and the top sources", () => {
  const inbox = [
    row("https://www.jobstreet.test/1", { company: "Acme" }),
    row("https://www.jobstreet.test/2", { company: "Acme" }),
    row("https://kalibrr.test/3", { company: "" }),
  ];
  const summary = skippedSummary(inbox, [{ url: "https://x.test/t" }]);
  assert.equal(summary.total, 3);
  assert.equal(summary.reviewed, 4);
  assert.equal(summary.share, 75);
  assert.deepEqual(summary.bySource.map((s) => [s.label, s.count]), [["jobstreet.test", 2], ["kalibrr.test", 1]]);
  assert.deepEqual(summary.byCompany.map((s) => [s.label, s.count]), [["Acme", 2], ["Unknown", 1]]);
});

test("nothing reviewed gives no share", () => {
  const summary = skippedSummary([], []);
  assert.equal(summary.total, 0);
  assert.equal(summary.share, null);
});
