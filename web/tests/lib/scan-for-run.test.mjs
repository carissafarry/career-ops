// A scheduled run points at the scan it produced: the newest scan inside the run's time span.
//
// Run: node --experimental-strip-types --test tests/lib/scan-for-run.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { lastFinishedRun, scanForRun } from "../../src/lib/scan-for-run.mjs";

const scans = [
  { id: "2026-11-18T17:24:00.000Z", startedAt: "2026-11-18T17:24:00.000Z" },
  { id: "2026-11-18T17:00:00.000Z", startedAt: "2026-11-18T17:00:00.000Z" },
  { id: "full-sweep", startedAt: "2026-11-18T16:57:00.000Z" },
];

test("the scan inside the run's span is chosen, the newest when several fit", () => {
  assert.equal(scanForRun(scans, { at: "2026-11-18T17:24:30.000Z", durationMs: 22_000 }), "2026-11-18T17:24:00.000Z");
  // A long run spans the sweep and the board scan: the newest of them.
  assert.equal(scanForRun(scans, { at: "2026-11-18T17:25:00.000Z", durationMs: 30 * 60_000 }), "2026-11-18T17:24:00.000Z");
  assert.equal(scanForRun(scans, { at: "2026-11-18T17:01:00.000Z", durationMs: 4 * 60_000 }), "2026-11-18T17:00:00.000Z");
});

test("no scan in the span means no match", () => {
  assert.equal(scanForRun(scans, { at: "2026-11-18T20:00:00.000Z", durationMs: 5_000 }), null);
  assert.equal(scanForRun([], { at: "2026-11-18T17:24:30.000Z", durationMs: 1000 }), null);
  assert.equal(scanForRun(scans, null), null);
  assert.equal(scanForRun(scans, { at: "not a date" }), null);
});

test("a run with no duration is matched within a minute of its end", () => {
  assert.equal(scanForRun(scans, { at: "2026-11-18T17:24:30.000Z" }), "2026-11-18T17:24:00.000Z");
});

test("the last finished run of a job ignores other jobs and unfinished runs", () => {
  const runs = [
    { jobId: "a", state: "success", at: "2026-11-18T10:00:00.000Z" },
    { jobId: "a", state: "failed", at: "2026-11-18T12:00:00.000Z" },
    { jobId: "a", state: "running", at: "2026-11-18T13:00:00.000Z" },
    { jobId: "b", state: "success", at: "2026-11-18T14:00:00.000Z" },
  ];
  assert.equal(lastFinishedRun(runs, "a").at, "2026-11-18T12:00:00.000Z");
  assert.equal(lastFinishedRun(runs, "c"), null);
});

test("a LinkedIn poll never takes a scheduled run's scan, even when it is the newest inside the window", () => {
  // The scan started 08:45:27; the watcher polled at 08:46:26, inside the run's +60s slack.
  const mixed = [
    { id: "2026-11-20T08:45:27.439Z", startedAt: "2026-11-20T08:45:27.439Z" },
    { id: "linkedin-2026-11-20T08:46:26.277Z", startedAt: "2026-11-20T08:46:26.277Z" },
  ];
  assert.equal(scanForRun(mixed, { at: "2026-11-20T08:45:27.466Z", durationMs: 9_200 }), "2026-11-20T08:45:27.439Z");
  assert.equal(scanForRun([mixed[1]], { at: "2026-11-20T08:45:27.466Z", durationMs: 9_200 }), null);
});
