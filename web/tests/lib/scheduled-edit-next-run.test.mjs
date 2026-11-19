// Saving an edit on a scheduled scan must not start it. A next run that had
// already slipped into the past would otherwise be picked up as due right away.
//
// Run: node --experimental-strip-types --test tests/lib/scheduled-edit-next-run.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { nextRunAfterEdit } from "../../src/lib/scheduled-cadence.mjs";

const NOW = Date.parse("2026-11-19T10:00:00Z");
const job = (over = {}) => ({
  startAt: "2026-11-17T09:00:00Z",
  every: 30,
  unit: "minutes",
  timezone: "UTC",
  nextRunAt: "2026-11-19T10:15:00Z",
  ...over,
});
const none = { startChanged: false, cadenceChanged: false };

test("a healthy next run is left alone when only name or filters change", () => {
  assert.equal(nextRunAfterEdit(job(), none, NOW), null);
});

test("a next run that already slipped into the past moves to the next slot", () => {
  const next = nextRunAfterEdit(job({ nextRunAt: "2026-11-19T02:54:00Z" }), none, NOW);
  assert.ok(Date.parse(next) > NOW, "must be in the future");
  assert.ok(Date.parse(next) - NOW <= 30 * 60_000, "within one interval");
});

test("a missing next run is treated as overdue", () => {
  const next = nextRunAfterEdit(job({ nextRunAt: null }), none, NOW);
  assert.ok(Date.parse(next) > NOW);
});

test("a changed cadence is re-slotted after now", () => {
  const next = nextRunAfterEdit(job({ every: 2, unit: "hours" }), { startChanged: false, cadenceChanged: true }, NOW);
  assert.ok(Date.parse(next) > NOW);
});

test("a start time in the future is the first run", () => {
  const future = "2026-11-20T08:00:00Z";
  assert.equal(nextRunAfterEdit(job({ startAt: future }), { startChanged: true, cadenceChanged: false }, NOW), future);
});

test("a start time in the past does not run now", () => {
  const next = nextRunAfterEdit(job({ startAt: "2026-11-18T08:00:00Z" }), { startChanged: true, cadenceChanged: false }, NOW);
  assert.ok(Date.parse(next) > NOW);
});
