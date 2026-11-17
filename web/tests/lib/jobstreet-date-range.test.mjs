import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveDateRange } from "../../../providers/jobstreet.mjs";

const now = Date.parse("2026-11-17T12:00:00Z");
const daysAgo = (n) => now - n * 86_400_000;

test("no window asked for means no limit", () => {
  assert.equal(resolveDateRange({}, {}, now), null);
});

test("the entry's own dateRange rounds up to a value SEEK accepts", () => {
  assert.equal(resolveDateRange({}, { dateRange: 3 }, now), 3);
  assert.equal(resolveDateRange({}, { dateRange: 2 }, now), 3);
  assert.equal(resolveDateRange({}, { dateRange: 10 }, now), 14);
  assert.equal(resolveDateRange({}, { dateRange: 40 }, now), null);
});

test("the scan's lookback narrows it, and the narrower of the two wins", () => {
  assert.equal(resolveDateRange({ sinceMs: daysAgo(1) }, {}, now), 1);
  assert.equal(resolveDateRange({ sinceMs: daysAgo(5) }, {}, now), 7);
  assert.equal(resolveDateRange({ sinceMs: daysAgo(1) }, { dateRange: 3 }, now), 1);
  assert.equal(resolveDateRange({ sinceMs: daysAgo(10) }, { dateRange: 3 }, now), 3);
});

test("a nonsense value is ignored instead of throwing", () => {
  assert.equal(resolveDateRange({ sinceMs: Number.NaN }, { dateRange: "abc" }, now), null);
  assert.equal(resolveDateRange(undefined, undefined, now), null);
});
