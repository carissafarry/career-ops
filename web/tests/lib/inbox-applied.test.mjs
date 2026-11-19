// Marking a Pipeline (inbox) job as applied straight from its row, without shortlisting or scoring it first.
//
// Run: node --experimental-strip-types --test tests/lib/inbox-applied.test.mjs

import test from "node:test";
import assert from "node:assert/strict";
import { markInboxApplied } from "../../src/lib/inbox-applied.mjs";

const jobs = [
  { url: "https://boards.greenhouse.io/acme/jobs/1", company: "Acme", role: "Go Developer", location: "Remote" },
  { url: "https://id.jobstreet.com/id/job/2", company: "Beta", role: "Backend Engineer", location: "Jakarta" },
];

test("each chosen job becomes one tracker row with its company, role, place and link", async () => {
  const calls = [];
  const r = await markInboxApplied(jobs, [jobs[0].url, jobs[1].url], async (p) => { calls.push(p); return { ok: true }; });
  assert.deepEqual(r.applied, [jobs[0].url, jobs[1].url]);
  assert.deepEqual(r.failed, []);
  assert.deepEqual(calls[0], { title: "Go Developer", company: "Acme", location: "Remote", link: jobs[0].url });
});

test("a URL that is not in the inbox is reported, and nothing is written for it", async () => {
  let calls = 0;
  const r = await markInboxApplied(jobs, ["https://example.com/nope"], async () => { calls += 1; return { ok: true }; });
  assert.equal(calls, 0);
  assert.deepEqual(r.applied, []);
  assert.equal(r.failed.length, 1);
  assert.match(r.failed[0].error, /inbox/i);
});

test("the same URL twice is applied once", async () => {
  let calls = 0;
  const r = await markInboxApplied(jobs, [jobs[0].url, jobs[0].url], async () => { calls += 1; return { ok: true }; });
  assert.equal(calls, 1);
  assert.deepEqual(r.applied, [jobs[0].url]);
});

test("one failure does not stop the rest, and the failure names the job and the reason", async () => {
  const r = await markInboxApplied(jobs, [jobs[0].url, jobs[1].url], async (p) => (p.company === "Acme" ? { ok: false, error: "The tracker merge failed." } : { ok: true }));
  assert.deepEqual(r.applied, [jobs[1].url]);
  assert.deepEqual(r.failed, [{ url: jobs[0].url, company: "Acme", error: "The tracker merge failed." }]);
});

test("jobs are written one after another, because the tracker merge takes a lock", async () => {
  let running = 0;
  let overlap = false;
  await markInboxApplied(jobs, jobs.map((j) => j.url), async () => {
    running += 1;
    if (running > 1) overlap = true;
    await new Promise((res) => setTimeout(res, 10));
    running -= 1;
    return { ok: true };
  });
  assert.equal(overlap, false);
});

test("a thrown error is a failure for that job, not a crash", async () => {
  const r = await markInboxApplied(jobs, [jobs[0].url], async () => { throw new Error("disk full"); });
  assert.deepEqual(r.applied, []);
  assert.match(r.failed[0].error, /disk full/);
});

test("the note goes to every job marked", async () => {
  const seen = [];
  await markInboxApplied(jobs, jobs.map((j) => j.url), async (p, note) => { seen.push([p.company, note]); return { ok: true }; }, "referral from Dina");
  assert.deepEqual(seen, [["Acme", "referral from Dina"], ["Beta", "referral from Dina"]]);
});

test("no note is an empty string, not undefined", async () => {
  let got = "unset";
  await markInboxApplied(jobs, [jobs[0].url], async (p, note) => { got = note; return { ok: true }; });
  assert.equal(got, "");
});
