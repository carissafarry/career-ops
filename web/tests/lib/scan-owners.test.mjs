// A scan on the Scans page is labelled with the scheduled scan that produced it.
//
// Run: node --experimental-strip-types --test tests/lib/scan-owners.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { scanOwners } from "../../src/lib/scan-for-run.mjs";

const jobs = [{ id: "a", name: "Scan All Indo" }, { id: "b", name: "  " }];
const scans = [
  { id: "s1", startedAt: "2026-11-18T04:26:30.000Z" },
  { id: "s2", startedAt: "2026-11-18T09:00:00.000Z" },
  { id: "s3", startedAt: "2026-11-18T12:00:00.000Z" },
];

test("a scan inside a scheduled run's span belongs to that job", () => {
  const runs = [{ jobId: "a", state: "success", at: "2026-11-18T04:27:43.304Z", durationMs: 88_443 }];
  assert.deepEqual([...scanOwners(scans, runs, jobs)], [["s1", { jobId: "a", name: "Scan All Indo" }]]);
});

test("a scan no run matches has no owner", () => {
  const runs = [{ jobId: "a", state: "success", at: "2026-11-18T04:27:43.304Z", durationMs: 88_443 }];
  const owners = scanOwners(scans, runs, jobs);
  assert.equal(owners.has("s2"), false);
  assert.equal(owners.has("s3"), false);
});

test("runs that never finished, or belong to an unknown job, are ignored", () => {
  const runs = [
    { jobId: "a", state: "running", at: "2026-11-18T09:00:30.000Z", durationMs: 30_000 },
    { jobId: "zzz", state: "success", at: "2026-11-18T12:00:30.000Z", durationMs: 30_000 },
  ];
  assert.equal(scanOwners(scans, runs, jobs).size, 0);
});

test("a job with no name gets a generic one", () => {
  const runs = [{ jobId: "b", state: "failed", at: "2026-11-18T09:00:30.000Z", durationMs: 30_000 }];
  assert.equal(scanOwners(scans, runs, jobs).get("s2").name, "Scheduled scan");
});
