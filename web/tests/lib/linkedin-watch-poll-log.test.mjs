import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildScanRuns, scanLabel } from "../../src/lib/scan-runs-core.mjs";
import { appendPollLog } from "../../src/lib/linkedin-watch/scan-log.mjs";
import { applyAction, ingest } from "../../src/lib/linkedin-watch/api.mjs";
import { watchPaths } from "../../src/lib/linkedin-watch/store.mjs";

const URL_OK = "https://www.linkedin.com/jobs/search/?f_TPR=r86400&sortBy=DD";
const page = { url: URL_OK, title: "Jobs", bodyText: "x", status: 200 };
const card = (id) => ({ jobId: String(id), title: `Job ${id}`, company: "Co", location: "Remote", posted: "" });
const paths = () => watchPaths(fs.mkdtempSync(path.join(os.tmpdir(), "lw-polls-")));
const at = (min) => ({ now: new Date(Date.UTC(2026, 10, 19, 11, min)), random: () => 0.5, notify: () => {} });
const lines = (file) => fs.readFileSync(file, "utf8").trim().split("\n");

test("a poll that listed nothing still becomes a LinkedIn run, with what it read and matched", () => {
  const runs = buildScanRuns({ linkedinPollsTsv: "started_at\tread\tkept\tnew\tbaseline\n2026-11-19T11:24:05.000Z\t25\t9\t0\t0\n" });
  assert.equal(runs.length, 1);
  assert.equal(runs[0].id, "linkedin-2026-11-19T11:24:05.000Z");
  assert.deepEqual([runs[0].found, runs[0].kept, runs[0].added, runs[0].postings.length], [25, 9, 0, 0]);
  assert.match(scanLabel(runs[0]), /^LinkedIn watch /);
});

test("a poll that listed roles keeps them and gains the read and matched counts, without a second run", () => {
  const iso = "2026-11-19T11:03:06.722Z";
  const originTsv = `url\tscan\tstarted_at\tcompany\trole\tlocation\tposted_at\nhttps://www.linkedin.com/jobs/view/1/\tlinkedin-${iso}\t${iso}\tCo\tRole\tJakarta\t\n`;
  const runs = buildScanRuns({ originTsv, linkedinPollsTsv: `started_at\tread\tkept\tnew\tbaseline\n${iso}\t25\t9\t1\t1\n` });
  assert.equal(runs.length, 1);
  assert.deepEqual([runs[0].found, runs[0].kept, runs[0].postings.length], [25, 9, 1]);
});

test("the poll log is bounded, newest kept", () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "lw-log-")), "polls.tsv");
  for (let i = 0; i < 650; i += 1) appendPollLog(file, { startedAt: `t${i}`, read: 25, kept: 9, added: 0, baseline: false });
  const all = lines(file);
  assert.equal(all[0], "started_at\tread\tkept\tnew\tbaseline");
  assert.equal(all.length - 1, 600);
  assert.ok(all.at(-1).startsWith("t649\t"));
  assert.ok(all[1].startsWith("t50\t"));
});

test("every recorded poll is logged, also the ones that find nothing new", async () => {
  const p = paths();
  applyAction(p, { action: "save-config", search_url: URL_OK });
  applyAction(p, { action: "enable" });
  await ingest(p, { cards: [card(1), card(2)], page }, "chrome-extension://abc", at(0)); // baseline: lists 2
  await ingest(p, { cards: [card(1), card(2)], page }, "chrome-extension://abc", at(5)); // nothing new
  await ingest(p, { cards: [card(3), card(1), card(2)], page }, "chrome-extension://abc", at(10)); // one new
  const rows = lines(p.pollLogFile).slice(1).map((l) => l.split("\t"));
  assert.equal(rows.length, 3);
  assert.deepEqual(rows.map((r) => [r[1], r[3], r[4]]), [["2", "2", "1"], ["2", "0", "0"], ["3", "1", "0"]]); // read, listed, baseline
  const runs = buildScanRuns({ originTsv: fs.readFileSync(p.originFile, "utf8"), linkedinPollsTsv: fs.readFileSync(p.pollLogFile, "utf8") });
  assert.equal(runs.length, 3);
  assert.deepEqual(runs.map((r) => r.postings.length).sort(), [0, 1, 2]);
});

test("a poll that is not recorded (stopped, or halted) leaves no history line", async () => {
  const p = paths();
  applyAction(p, { action: "save-config", search_url: URL_OK });
  await ingest(p, { cards: [card(1)], page }, "chrome-extension://abc", at(0)); // never enabled
  assert.equal(fs.existsSync(p.pollLogFile), false);
  applyAction(p, { action: "enable" });
  await ingest(p, { cards: [], page: { ...page, url: "https://www.linkedin.com/authwall" } }, "chrome-extension://abc", at(5)); // halt page
  assert.equal(fs.existsSync(p.pollLogFile), false);
});
