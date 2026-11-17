import assert from "node:assert/strict";
import { test } from "node:test";
import { buildScanRuns, scanIdByUrl } from "../../src/lib/scan-runs-core.mjs";

const RUNS = [
  "timestamp\tstatus\tcompanies\tboards\tfound\tfiltered_title\tfiltered_tier\tfiltered_location\tfiltered_posting_age\tfiltered_salary\tfiltered_content\tfiltered_cooldown\tdupes\tnew_added",
  "2026-11-17T07:32:55.517Z\tcompleted\t104\t1\t100\t90\t0\t0\t0\t0\t0\t0\t4\t2",
  "2026-11-17T07:37:46.780Z\tcompleted\t104\t1\t120\t100\t0\t0\t0\t0\t0\t0\t8\t3",
].join("\n");

const row = (url, status, company = "Co", role = "Backend Engineer") =>
  [url, "2026-11-17", "x-api", role, company, status, "Jakarta"].join("\t");

test("splits the newest added rows into one block per run, in run order", () => {
  const history = [
    row("https://old/1", "added"),
    row("https://a/1", "added"),
    row("https://skip/1", "skipped_title"),
    row("https://a/2", "added"),
    row("https://b/1", "added"),
    row("https://b/2", "added"),
    row("https://b/3", "added"),
  ].join("\n");
  const runs = buildScanRuns({ runsTsv: RUNS, historyTsv: history });
  assert.equal(runs.length, 2);
  assert.equal(runs[0].id, "2026-11-17T07:37:46.780Z");
  assert.deepEqual(runs[0].postings.map((p) => p.url), ["https://b/1", "https://b/2", "https://b/3"]);
  assert.deepEqual(runs[1].postings.map((p) => p.url), ["https://a/1", "https://a/2"]);
  assert.equal(runs[1].found, 100);
  assert.equal(runs[1].filteredTitle, 90);
});

test("full-scan URLs are grouped on their own and kept out of the run ordering", () => {
  const history = [
    row("https://a/1", "added"),
    row("https://a/2", "added"),
    row("https://full/1", "added", "BigCo", "Platform Engineer"),
    row("https://b/1", "added"),
    row("https://b/2", "added"),
    row("https://b/3", "added"),
  ].join("\n");
  const origin = ["url\tscan\tstarted_at", "https://full/1\tfull-2026-11-17\t2026-11-17T20:00:00.000Z"].join("\n");
  const runs = buildScanRuns({ runsTsv: RUNS, historyTsv: history, originTsv: origin });
  assert.equal(runs.length, 3);
  const full = runs.find((r) => r.kind === "full");
  assert.equal(full.id, "full-2026-11-17");
  assert.equal(full.postings[0].company, "BigCo");
  const filtered = runs.filter((r) => r.kind === "filtered");
  assert.deepEqual(filtered[0].postings.map((p) => p.url), ["https://b/1", "https://b/2", "https://b/3"]);
  assert.deepEqual(filtered[1].postings.map((p) => p.url), ["https://a/1", "https://a/2"]);
});

test("a full-scan row can carry its own details and posted date, with no history row at all", () => {
  const origin = [
    "url\tscan\tstarted_at\tcompany\trole\tlocation\tposted_at",
    "https://f/1\tfull-x\t2026-11-17T12:06:00.000Z\tBigCo\tPlatform Engineer\tRemote\t2026-11-16",
    "https://f/2\tfull-x\t2026-11-17T12:06:00.000Z\tOtherCo\tBackend Developer\t\t",
  ].join("\n");
  const run = buildScanRuns({ originTsv: origin }).find((r) => r.id === "full-x");
  assert.equal(run.kind, "full");
  assert.equal(run.added, 2);
  assert.deepEqual(run.postings.map((p) => [p.company, p.role, p.postedAt]), [
    ["BigCo", "Platform Engineer", "2026-11-16"],
    ["OtherCo", "Backend Developer", ""],
  ]);
});

test("the posted date of a history row is read from its ninth column", () => {
  const history = ["https://a/1", "2026-11-17", "p", "Backend", "Co", "added", "Jakarta", "", "2026-11-15"].join("\t");
  const runs = buildScanRuns({ runsTsv: RUNS, historyTsv: history });
  assert.equal(runs.flatMap((r) => r.postings)[0].postedAt, "2026-11-15");
});

test("fewer history rows than the logged total never throws", () => {
  const runs = buildScanRuns({ runsTsv: RUNS, historyTsv: row("https://only/1", "added") });
  assert.equal(runs.length, 2);
  assert.equal(runs.flatMap((r) => r.postings).length, 1);
});

test("a pinned posting list keeps a run's roles even after their history status changes", () => {
  const history = [
    row("https://a/1", "skipped_age"),
    row("https://a/2", "added"),
    row("https://b/1", "added"),
    row("https://b/2", "added"),
    row("https://b/3", "added"),
  ].join("\n");
  const postings = ["url\trun_id", "https://a/1\t2026-11-17T07:32:55.517Z", "https://a/2\t2026-11-17T07:32:55.517Z"].join("\n");
  const runs = buildScanRuns({ runsTsv: RUNS, historyTsv: history, postingsTsv: postings });
  const first = runs.find((r) => r.id === "2026-11-17T07:32:55.517Z");
  assert.deepEqual(first.postings.map((p) => p.url), ["https://a/1", "https://a/2"]);
  assert.equal(first.postings[0].company, "Co");
  const second = runs.find((r) => r.id === "2026-11-17T07:37:46.780Z");
  assert.deepEqual(second.postings.map((p) => p.url), ["https://b/1", "https://b/2", "https://b/3"]);
});

test("empty inputs give no runs, and scanIdByUrl maps every posting", () => {
  assert.deepEqual(buildScanRuns({}), []);
  const runs = buildScanRuns({ runsTsv: RUNS, historyTsv: [row("https://a/1", "added"), row("https://a/2", "added"), row("https://b/1", "added"), row("https://b/2", "added"), row("https://b/3", "added")].join("\n") });
  const map = scanIdByUrl(runs);
  assert.equal(map["https://b/1"], "2026-11-17T07:37:46.780Z");
  assert.equal(map["https://a/1"], "2026-11-17T07:32:55.517Z");
});
