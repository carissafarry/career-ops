// A LinkedIn job added to the Pipeline keeps the hour LinkedIn gave it, so the Pipeline can show "5h ago"
// (the core only stores a date), and it carries a date so the Pipeline can sort and age it like any other row.
//
// Run: node --experimental-strip-types --test tests/lib/linkedin-watch-posted-log.test.mjs

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { recordPosted, readPosted, withPostedExact } from "../../src/lib/linkedin-watch/posted-log.mjs";
import { shortAgo } from "../../src/lib/linkedin-watch/posted-age.mjs";
import { addPostings } from "../../src/lib/linkedin-watch/api.mjs";
import { watchPaths, writeState } from "../../src/lib/linkedin-watch/store.mjs";
import { emptyState } from "../../src/lib/linkedin-watch/state.mjs";

const tmp = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), "lw-posted-")), "linkedin-posted.tsv");
const U1 = "https://www.linkedin.com/jobs/view/1/";
const U2 = "https://www.linkedin.com/jobs/view/2/";

test("recorded posting times read back by URL; a later record of the same URL replaces the earlier one", () => {
  const file = tmp();
  assert.deepEqual(readPosted(file), {}, "no file yet is an empty map");
  recordPosted(file, [{ url: U1, postedAt: "2026-11-20T08:00:00.000Z" }, { url: U2, postedAt: "2026-11-20T09:00:00.000Z" }]);
  recordPosted(file, [{ url: U1, postedAt: "2026-11-20T07:30:00.000Z" }]);
  assert.deepEqual(readPosted(file), { [U1]: "2026-11-20T07:30:00.000Z", [U2]: "2026-11-20T09:00:00.000Z" });
});

test("rows without a usable time are not written", () => {
  const file = tmp();
  recordPosted(file, [{ url: U1, postedAt: "" }, { url: "", postedAt: "2026-11-20T08:00:00.000Z" }, { url: U2, postedAt: "not a date" }]);
  assert.deepEqual(readPosted(file), {});
});

test("the file stays bounded", () => {
  const file = tmp();
  const rows = Array.from({ length: 2300 }, (_, i) => ({ url: `https://www.linkedin.com/jobs/view/${i}/`, postedAt: "2026-11-20T08:00:00.000Z" }));
  recordPosted(file, rows);
  const map = readPosted(file);
  assert.equal(Object.keys(map).length, 2000);
  assert.ok(map["https://www.linkedin.com/jobs/view/2299/"], "the newest are kept");
  assert.ok(!map["https://www.linkedin.com/jobs/view/0/"], "the oldest are dropped");
});

test("withPostedExact attaches the time to the jobs that have one and leaves the rest", () => {
  const jobs = [{ url: U1, role: "A" }, { url: "https://boards.greenhouse.io/x/jobs/9", role: "B" }];
  const out = withPostedExact(jobs, { [U1]: "2026-11-20T08:00:00.000Z" });
  assert.equal(out[0].postedAtExact, "2026-11-20T08:00:00.000Z");
  assert.equal("postedAtExact" in out[1], false);
});

test("a short age for the Pipeline: minutes under an hour, hours under a day", () => {
  assert.equal(shortAgo(10_000), "just now");
  assert.equal(shortAgo(40 * 60_000), "40m ago");
  assert.equal(shortAgo(5 * 3_600_000 + 20 * 60_000), "5h ago");
  assert.equal(shortAgo(-60_000), "just now");
});

test("adding a LinkedIn job to the pipeline sends its posted date and remembers its hour", async () => {
  const p = watchPaths(fs.mkdtempSync(path.join(os.tmpdir(), "lw-add-")));
  writeState(p, { ...emptyState(), postings: [
    { id: "1", title: "T", company: "C", location: "Remote", link: U1, postedText: "5 hours ago", firstSeen: "2026-11-20T12:00:00.000Z" },
    { id: "2", title: "U", company: "C", location: "Remote", link: U2, postedText: "", firstSeen: "2026-11-20T12:00:00.000Z" },
  ] });
  let sent = [];
  const r = await addPostings(p, ["1", "2"], async (offers) => { sent = offers; return { added: offers.length }; });
  assert.equal(r.status, 200);
  assert.equal(sent.find((o) => o.url === U1).postedAt, "2026-11-20");
  assert.equal(sent.find((o) => o.url === U2).postedAt, "");
  assert.deepEqual(readPosted(p.postedFile), { [U1]: "2026-11-20T07:00:00.000Z" });
});
