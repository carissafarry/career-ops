// "Ignore jobs older than N": the URL's own date filter is not trusted, so the app filters again on the age LinkedIn shows.
//
// Run: node --experimental-strip-types --test tests/lib/linkedin-watch-max-age.test.mjs

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { handleIngest } from "../../src/lib/linkedin-watch/ingest.mjs";
import { parseWatchConfig, WatchConfigError } from "../../src/lib/linkedin-watch/config.mjs";
import { applyAction, getOverview } from "../../src/lib/linkedin-watch/api.mjs";
import { emptyState, applyPoll } from "../../src/lib/linkedin-watch/state.mjs";
import { emptyStatus, watchPaths } from "../../src/lib/linkedin-watch/store.mjs";

const URL_OK = "https://www.linkedin.com/jobs/search/?f_TPR=r86400";
const cfgWith = (extra = {}) => parseWatchConfig({ search_url: URL_OK, ...extra });
const OK_PAGE = { url: URL_OK, title: "Jobs", bodyText: "x", status: 200 };
const raw = (id, posted) => ({ jobId: String(id), title: `Job ${id}`, company: "Co", location: "Remote", posted });
const NOW = new Date(2026, 10, 20, 12, 0, 0);
const running = () => ({ ...emptyStatus(), state: "running" });
const baselined = () => applyPoll(emptyState(), [{ id: "1", title: "T", company: "Co", location: "", link: "https://www.linkedin.com/jobs/view/1/", postedText: "" }], NOW.toISOString()).state;

function run(cfg, cards, over = {}) {
  const notes = [];
  const out = handleIngest({ payload: { cards, page: OK_PAGE }, cfg, state: baselined(), status: running(), now: NOW, random: () => 0.5, notify: (n) => notes.push(n), ...over });
  return { ...out, notes };
}

test("the limit is optional and read as a whole number of hours", () => {
  assert.equal(cfgWith().maxAgeHours, null);
  assert.equal(cfgWith({ max_age_hours: 24 }).maxAgeHours, 24);
  assert.equal(cfgWith({ max_age_hours: 72 }).maxAgeHours, 72);
  for (const bad of [0, -3, 1.5, "soon", 24 * 400]) assert.throws(() => cfgWith({ max_age_hours: bad }), WatchConfigError, String(bad));
});

test("a job older than the limit is not listed or notified, but it is marked seen so it never returns as new", () => {
  const r = run(cfgWith({ max_age_hours: 24 }), [raw(1, "2 hours ago"), raw(7, "1 week ago"), raw(8, "3 days ago"), raw(9, "5 hours ago")]);
  assert.deepEqual(r.state.postings.map((p) => p.id).sort(), ["1", "9"]);
  assert.ok("7" in r.state.seen && "8" in r.state.seen, "old jobs are remembered as seen");
  assert.equal(r.status.lastNewCount, 1);
  assert.equal(r.notes.length, 1);
  assert.match(r.notes[0].body, /Job 9/);
});

test("without a limit nothing is dropped for its age", () => {
  const r = run(cfgWith(), [raw(1, "2 hours ago"), raw(7, "1 week ago")]);
  assert.deepEqual(r.state.postings.map((p) => p.id).sort(), ["1", "7"]);
});

test("a job whose age could not be read is kept, never hidden by a guess", () => {
  const r = run(cfgWith({ max_age_hours: 24 }), [raw(1, "2 hours ago"), raw(5, "")]);
  assert.ok(r.state.postings.some((p) => p.id === "5"));
});

test("the limit works together with the title and location filter", () => {
  const keep = (card) => card.id !== "9"; // the user's filter drops job 9
  const r = run(cfgWith({ max_age_hours: 24 }), [raw(1, "2 hours ago"), raw(7, "1 week ago"), raw(9, "1 hour ago"), raw(10, "4 hours ago")], { keep });
  assert.deepEqual(r.state.postings.map((p) => p.id).sort(), ["1", "10"]);
  assert.equal(r.status.lastKeptCount, 2);
});

test("the limit is counted against the time the poll ran, so 'N days' means days before now", () => {
  const r = run(cfgWith({ max_age_hours: 72 }), [raw(1, "2 days ago"), raw(7, "4 days ago"), raw(8, "1 week ago")]);
  assert.deepEqual(r.state.postings.map((p) => p.id).sort(), ["1"]);
});

test("save-config stores the limit and the overview returns it; an empty limit clears it", () => {
  const p = watchPaths(fs.mkdtempSync(path.join(os.tmpdir(), "lw-maxage-")));
  assert.equal(applyAction(p, { action: "save-config", search_url: URL_OK, max_age_hours: 48 }).status, 200);
  assert.equal(getOverview(p).config.max_age_hours, 48);
  assert.equal(applyAction(p, { action: "save-config", search_url: URL_OK, max_age_hours: "" }).status, 200);
  assert.equal(getOverview(p).config.max_age_hours, undefined);
  assert.equal(applyAction(p, { action: "save-config", search_url: URL_OK, max_age_hours: 0 }).status, 400);
});
