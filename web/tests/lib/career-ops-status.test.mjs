import assert from "node:assert/strict";
import { test } from "node:test";
import { ago, lastRow, parseLaunchctlList } from "../../../scripts/career-ops-status.mjs";

test("launchctl list becomes label -> pid and exit status", () => {
  const parsed = parseLaunchctlList("PID\tStatus\tLabel\n-\t0\tio.career-ops.notify\n4321\t0\tio.career-ops.scheduled-scan\n-\t78\tcom.example.broken");
  assert.deepEqual(parsed["io.career-ops.notify"], { pid: null, status: 0 });
  assert.equal(parsed["io.career-ops.scheduled-scan"].pid, "4321");
  assert.equal(parsed["com.example.broken"].status, 78);
});

test("the last TSV row is keyed by its header; a header-only file gives null", () => {
  const row = lastRow("timestamp\tnew_added\n2026-11-17T01:00:00Z\t1\n2026-11-17T04:00:00Z\t5\n");
  assert.deepEqual(row, { timestamp: "2026-11-17T04:00:00Z", new_added: "5" });
  assert.equal(lastRow("timestamp\tnew_added\n"), null);
  assert.equal(lastRow(""), null);
});

test("relative time reads in minutes, hours and days", () => {
  const now = Date.parse("2026-11-17T12:00:00Z");
  assert.equal(ago("2026-11-17T11:59:30Z", now), "baru saja");
  assert.equal(ago("2026-11-17T11:30:00Z", now), "30 menit lalu");
  assert.equal(ago("2026-11-17T09:00:00Z", now), "3 jam lalu");
  assert.equal(ago("2026-11-14T12:00:00Z", now), "3 hari lalu");
  assert.equal(ago("not a date", now), "tidak diketahui");
});
