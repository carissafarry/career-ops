import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { applyAction, addPosting, addPostings, markApplied, ingest, getExtensionConfig, getOverview } from "../../src/lib/linkedin-watch/api.mjs";
import { watchPaths, writeState, readState } from "../../src/lib/linkedin-watch/store.mjs";
import { emptyState } from "../../src/lib/linkedin-watch/state.mjs";

const URL_OK = "https://www.linkedin.com/jobs/search/?f_TPR=r86400";
const paths = () => watchPaths(fs.mkdtempSync(path.join(os.tmpdir(), "lw-api-")));

test("save-config rejects an interval below 5", () => {
  const r = applyAction(paths(), { action: "save-config", search_url: URL_OK, interval_minutes: 3 });
  assert.equal(r.status, 400);
});

test("enable needs a saved config, then flips the extension config on", () => {
  const p = paths();
  assert.equal(applyAction(p, { action: "enable" }).status, 400);
  assert.equal(applyAction(p, { action: "save-config", search_url: URL_OK, interval_minutes: 7 }).status, 200);
  assert.equal(applyAction(p, { action: "enable" }).status, 200);
  assert.deepEqual(getExtensionConfig(p), { enabled: true, searchUrl: URL_OK, runNow: false, pages: 5, nextPollAt: null }); // no baseline yet: read deep
  applyAction(p, { action: "disable" });
  assert.equal(getExtensionConfig(p).enabled, false);
});

test("add: unknown id is 404 and a posting is written once", async () => {
  const p = paths();
  const posting = { id: "9", title: "T", company: "C", location: "Remote", link: "https://www.linkedin.com/jobs/view/9/", postedText: "", firstSeen: "x" };
  writeState(p, { ...emptyState(), postings: [posting] });
  let calls = 0;
  const add = async () => { calls += 1; return { added: 1 }; };
  assert.equal((await addPosting(p, "nope", add)).status, 404);
  assert.equal((await addPosting(p, "9", add)).body.added, 1);
  assert.equal((await addPosting(p, "9", add)).body.added, 0);
  assert.equal(calls, 1);
});

test("ingest refuses non-extension origins", async () => {
  const payload = { cards: [], page: { url: URL_OK, title: "", bodyText: "", status: 200 } };
  assert.equal((await ingest(paths(), payload, "http://localhost:3000")).status, 403);
  assert.equal((await ingest(paths(), payload, undefined)).status, 403);
  assert.equal((await ingest(paths(), payload, "chrome-extension://abc")).status, 200);
});

test("run-now needs a running watcher, then flags the extension config", () => {
  const p = paths();
  assert.equal(applyAction(p, { action: "run-now" }).status, 400);
  applyAction(p, { action: "save-config", search_url: URL_OK });
  assert.equal(applyAction(p, { action: "run-now" }).status, 400);
  applyAction(p, { action: "enable" });
  assert.equal(getExtensionConfig(p).runNow, false);
  assert.equal(applyAction(p, { action: "run-now" }).status, 200);
  assert.equal(getExtensionConfig(p).runNow, true);
  applyAction(p, { action: "disable" });
  assert.equal(getExtensionConfig(p).runNow, false);
});

test("ack clears the highlight for one posting or all", () => {
  const p = paths();
  const post = (id) => ({ id, title: "T", company: "C", location: "", link: `https://www.linkedin.com/jobs/view/${id}/`, postedText: "", firstSeen: "x" });
  writeState(p, { ...emptyState(), postings: [post("1"), post("2")] });
  applyAction(p, { action: "ack", id: "1" });
  assert.deepEqual(readState(p).postings.map((x) => Boolean(x.acknowledged)), [true, false]);
  applyAction(p, { action: "ack" });
  assert.ok(readState(p).postings.every((x) => x.acknowledged));
});

test("a poll's postings are logged as one scan in scan-origin.tsv, once", async () => {
  const { buildScanRuns, scanLabel } = await import("../../src/lib/scan-runs-core.mjs");
  const p = paths();
  applyAction(p, { action: "save-config", search_url: URL_OK });
  applyAction(p, { action: "enable" });
  const raw = (id) => ({ jobId: String(id), title: `Job\t${id}`, company: "Co", location: "Remote", posted: "" });
  const page = { url: URL_OK, title: "Jobs", bodyText: "x", status: 200 };
  const at = (min) => ({ now: new Date(Date.UTC(2026, 10, 19, 10, min)), random: () => 0.5, notify: () => {} });
  await ingest(p, { cards: [raw(1), raw(2), raw(3)], page }, "chrome-extension://abc", at(0));
  const lines = fs.readFileSync(p.originFile, "utf8").trim().split("\n");
  assert.equal(lines.length, 4); // header + 3
  assert.ok(lines[1].startsWith("https://www.linkedin.com/jobs/view/1/\tlinkedin-2026-11-19T10:00:00.000Z\t"));
  assert.ok(!lines[1].includes("Job\t1")); // tab inside a title is flattened
  await ingest(p, { cards: [raw(1), raw(2), raw(3)], page }, "chrome-extension://abc", at(5));
  assert.equal(fs.readFileSync(p.originFile, "utf8").trim().split("\n").length, 4); // nothing new, nothing appended
  await ingest(p, { cards: [raw(9), raw(1)], page }, "chrome-extension://abc", at(10));
  assert.equal(fs.readFileSync(p.originFile, "utf8").trim().split("\n").length, 5);
  const runs = buildScanRuns({ originTsv: fs.readFileSync(p.originFile, "utf8") });
  assert.deepEqual(runs.map((r) => r.postings.length).sort(), [1, 3]);
  assert.match(scanLabel(runs[0]), /^LinkedIn watch /);
  assert.ok(readState(p).postings.every((x) => x.scanId));
});

test("save-config keeps filters; a bad filters shape is a 400", () => {
  const p = paths();
  const filters = { positive: [" Backend Engineer ", "Backend Engineer", ""], negative: ["Senior"], blockHard: ["India"] };
  assert.equal(applyAction(p, { action: "save-config", search_url: URL_OK, filters }).status, 200);
  assert.deepEqual(getOverview(p).config.filters, filters); // stored as written; parseWatchConfig trims and dedupes on read
  assert.equal(applyAction(p, { action: "save-config", search_url: URL_OK, filters: { positive: "Backend" } }).status, 400);
});

test("ingest applies the filters: only matching postings are listed, all count as seen", async () => {
  const p = paths();
  applyAction(p, { action: "save-config", search_url: URL_OK, filters: { positive: ["Backend"], negative: ["Senior"] } });
  applyAction(p, { action: "enable" });
  const runFilter = async (filters, cards) => new Set(cards.filter((c) => filters.positive.some((k) => c.title.includes(k)) && !filters.negative.some((k) => c.title.includes(k))).map((c) => c.id));
  const page = { url: URL_OK, title: "Jobs", bodyText: "x", status: 200 };
  const raw = (id, title) => ({ jobId: String(id), title, company: "Co", location: "Remote", posted: "" });
  const at = (min) => ({ now: new Date(Date.UTC(2026, 10, 19, 11, min)), random: () => 0.5, notify: () => {}, runFilter });
  await ingest(p, { cards: [raw(1, "Backend Engineer"), raw(2, "Marketing Lead"), raw(3, "Senior Backend Engineer")], page }, "chrome-extension://abc", at(0));
  assert.deepEqual(readState(p).postings.map((x) => x.id), ["1"]);
  assert.equal(Object.keys(readState(p).seen).length, 3);
  await ingest(p, { cards: [raw(4, "Backend Developer"), raw(5, "Chef"), raw(1, "Backend Engineer")], page }, "chrome-extension://abc", at(5));
  assert.deepEqual(readState(p).postings.map((x) => x.id), ["4", "1"]);
  const status = JSON.parse(fs.readFileSync(p.statusFile, "utf8"));
  assert.equal(status.lastCardCount, 3);
  assert.equal(status.lastKeptCount, 2);
  assert.equal(status.filterError, null);
});

test("a filter that cannot run keeps everything and reports it", async () => {
  const p = paths();
  applyAction(p, { action: "save-config", search_url: URL_OK, filters: { positive: ["Backend"] } });
  applyAction(p, { action: "enable" });
  const page = { url: URL_OK, title: "Jobs", bodyText: "x", status: 200 };
  const card = { jobId: "1", title: "Chef", company: "Co", location: "", posted: "" };
  const origError = console.error;
  console.error = () => {};
  try {
    await ingest(p, { cards: [card], page }, "chrome-extension://abc", { now: new Date(), random: () => 0.5, notify: () => {}, runFilter: async () => { throw new Error("no core"); } });
    assert.equal(readState(p).postings.length, 1);
    assert.match(JSON.parse(fs.readFileSync(p.statusFile, "utf8")).filterError, /no core/);
    const q = paths(); // no runner at all
    applyAction(q, { action: "save-config", search_url: URL_OK, filters: { positive: ["Backend"] } });
    applyAction(q, { action: "enable" });
    await ingest(q, { cards: [card], page }, "chrome-extension://abc", { now: new Date(), random: () => 0.5, notify: () => {} });
    assert.match(JSON.parse(fs.readFileSync(q.statusFile, "utf8")).filterError, /not available/);
  } finally {
    console.error = origError;
  }
});

test("a clock that moves between reads cannot split a poll from its scan record", async () => {
  const p = paths();
  applyAction(p, { action: "save-config", search_url: URL_OK });
  applyAction(p, { action: "enable" });
  const page = { url: URL_OK, title: "Jobs", bodyText: "x", status: 200 };
  const card = (id) => ({ jobId: String(id), title: `Job ${id}`, company: "Co", location: "Remote", posted: "" });
  let t = Date.UTC(2026, 10, 19, 11, 3, 6);
  const clock = () => new Date((t += 7)); // every read is 7 ms later, like a slow first run
  await ingest(p, { cards: [card(1), card(2)], page }, "chrome-extension://abc", { clock, random: () => 0.5, notify: () => {} });
  const lines = fs.readFileSync(p.originFile, "utf8").trim().split("\n");
  assert.equal(lines.length, 3);
  assert.ok(readState(p).postings.every((x) => x.scanId));
});

const seedPostings = (p, ids) => writeState(p, { ...emptyState(), seen: Object.fromEntries(ids.map((id) => [id, "x"])), postings: ids.map((id) => ({ id, title: `T${id}`, company: "Co", location: "Remote", link: `https://www.linkedin.com/jobs/view/${id}/`, postedText: "", firstSeen: "x" })) });

test("remove drops postings from the list but keeps their ids as seen", () => {
  const p = paths();
  seedPostings(p, ["1", "2", "3"]);
  const r = applyAction(p, { action: "remove", ids: ["1", "3", "nope"] });
  assert.equal(r.body.removed, 2);
  assert.deepEqual(readState(p).postings.map((x) => x.id), ["2"]);
  assert.equal(Object.keys(readState(p).seen).length, 3);
});

test("add to pipeline in bulk writes once, skips ones already added or applied", async () => {
  const p = paths();
  seedPostings(p, ["1", "2", "3"]);
  patchState(p, "3", { applied: true });
  const batches = [];
  const add = async (offers) => { batches.push(offers.map((o) => o.url)); return { added: offers.length }; };
  const r = await addPostings(p, ["1", "2", "3"], add);
  assert.equal(r.body.added, 2);
  assert.equal(batches.length, 1);
  assert.deepEqual(batches[0].map((u) => u.match(/view\/(\d+)/)[1]), ["1", "2"]);
  assert.equal((await addPostings(p, ["1", "2"], add)).body.added, 0);
  assert.equal(batches.length, 1);
});

test("mark applied adds a tracker row per posting, keeps failures apart, and is not repeated", async () => {
  const p = paths();
  seedPostings(p, ["1", "2", "3"]);
  const calls = [];
  const trackerAdd = async (posting) => { calls.push(posting.id); return posting.id === "2" ? { ok: false, error: "merge failed" } : { ok: true }; };
  const r = await markApplied(p, ["1", "2"], trackerAdd);
  assert.equal(r.status, 200);
  assert.equal(r.body.applied, 1);
  assert.deepEqual(r.body.failed.map((f) => [f.id, f.error]), [["2", "merge failed"]]);
  assert.deepEqual(readState(p).postings.map((x) => Boolean(x.applied)), [true, false, false]);
  await markApplied(p, ["1"], trackerAdd);
  assert.deepEqual(calls, ["1", "2"]); // posting 1 is not sent to the tracker twice
  assert.equal((await markApplied(p, ["2"], async () => ({ ok: false, error: "x" }))).status, 500);
  assert.equal((await markApplied(p, ["nope"], trackerAdd)).status, 404);
});

function patchState(p, id, patch) {
  const s = readState(p);
  writeState(p, { ...s, postings: s.postings.map((x) => (x.id === id ? { ...x, ...patch } : x)) });
}

test("the extension is told to read deep for the first scan and Run now, and few pages otherwise", async () => {
  const p = paths();
  applyAction(p, { action: "save-config", search_url: URL_OK, pages_per_poll: 2, deep_pages: 7 });
  applyAction(p, { action: "enable" });
  assert.equal(getExtensionConfig(p).pages, 7); // no baseline yet
  const page = { url: URL_OK, title: "Jobs", bodyText: "x", status: 200 };
  await ingest(p, { cards: [{ jobId: "1", title: "T", company: "C", location: "", posted: "" }], page, pages: 3 }, "chrome-extension://abc", { now: new Date(), random: () => 0.5, notify: () => {} });
  assert.equal(getExtensionConfig(p).pages, 2); // baseline exists: a normal poll
  assert.equal(JSON.parse(fs.readFileSync(p.statusFile, "utf8")).lastPages, 3);
  applyAction(p, { action: "run-now" });
  assert.equal(getExtensionConfig(p).pages, 7); // manual run reads deep again
});

test("changing the interval re-plans the next poll from the last poll, and tells the extension", () => {
  const p = paths();
  applyAction(p, { action: "save-config", search_url: URL_OK, interval_minutes: 5, jitter_percent: 0 });
  applyAction(p, { action: "enable" });
  const now = new Date(Date.UTC(2026, 10, 19, 12, 0, 0));
  const lastPoll = new Date(now.getTime() - 2 * 60_000); // polled 2 minutes ago
  const oldNext = new Date(lastPoll.getTime() + 5 * 60_000).toISOString();
  const status = JSON.parse(fs.readFileSync(p.statusFile, "utf8"));
  fs.writeFileSync(p.statusFile, JSON.stringify({ ...status, lastPollAt: lastPoll.toISOString(), nextPollAt: oldNext }));
  const nextAt = () => JSON.parse(fs.readFileSync(p.statusFile, "utf8")).nextPollAt;
  const deps = { now, random: () => 0.5 };

  applyAction(p, { action: "save-config", search_url: URL_OK, interval_minutes: 5, jitter_percent: 0, active_hours: "" }, deps);
  assert.equal(nextAt(), oldNext); // nothing about the timing changed: the plan stays put
  applyAction(p, { action: "save-config", search_url: URL_OK, interval_minutes: 10, jitter_percent: 0 }, deps);
  assert.equal(nextAt(), new Date(lastPoll.getTime() + 10 * 60_000).toISOString()); // 10 min after the last poll
  assert.equal(getExtensionConfig(p).nextPollAt, nextAt());
  applyAction(p, { action: "save-config", search_url: URL_OK, interval_minutes: 5, jitter_percent: 0 }, { now: new Date(lastPoll.getTime() + 20 * 60_000), random: () => 0.5 });
  assert.equal(nextAt(), new Date(lastPoll.getTime() + 20 * 60_000 + 30_000).toISOString()); // already overdue: soon, never in the past
});

test("a stopped watcher has no next poll to follow", () => {
  const p = paths();
  applyAction(p, { action: "save-config", search_url: URL_OK, interval_minutes: 5 });
  assert.equal(getExtensionConfig(p).nextPollAt, null);
  applyAction(p, { action: "enable" });
  applyAction(p, { action: "disable" });
  assert.equal(getExtensionConfig(p).nextPollAt, null);
});
