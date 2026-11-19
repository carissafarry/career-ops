import test from "node:test";
import assert from "node:assert/strict";
import { handleIngest } from "../../src/lib/linkedin-watch/ingest.mjs";
import { parseWatchConfig } from "../../src/lib/linkedin-watch/config.mjs";
import { emptyState, applyPoll } from "../../src/lib/linkedin-watch/state.mjs";
import { emptyStatus } from "../../src/lib/linkedin-watch/store.mjs";

const cfg = parseWatchConfig({ search_url: "https://www.linkedin.com/jobs/search/?f_TPR=r86400" });
const OK_PAGE = { url: "https://www.linkedin.com/jobs/search/?f_TPR=r86400", title: "Jobs", bodyText: "x", status: 200 };
const raw = (id) => ({ jobId: String(id), title: `Job ${id}`, company: "Co", location: "Remote", posted: "1 minute ago" });
const NOW = new Date(2026, 10, 19, 12, 0, 0);
const running = () => ({ ...emptyStatus(), state: "running" });
const baselined = () => applyPoll(emptyState(), [raw(1), raw(2)].map((r) => ({ id: r.jobId, title: r.title, company: "Co", location: "", link: `https://www.linkedin.com/jobs/view/${r.jobId}/`, postedText: "" })), NOW.toISOString()).state;

function run(over) {
  const notes = [];
  const out = handleIngest({
    payload: { cards: [raw(1), raw(2)], page: OK_PAGE },
    cfg, state: baselined(), status: running(), now: NOW, random: () => 0.5,
    notify: (n) => notes.push(n),
    ...over,
  });
  return { ...out, notes };
}

test("a halt page halts, notifies once, leaves state alone", () => {
  const state = baselined();
  const r = run({ state, payload: { cards: [], page: { ...OK_PAGE, url: "https://www.linkedin.com/checkpoint/x" } } });
  assert.equal(r.status.state, "halted");
  assert.equal(r.status.haltReason, "checkpoint");
  assert.equal(r.notes.length, 1);
  assert.deepEqual(r.state, state);
  assert.equal(r.reply.enabled, false);
});

test("two new postings notify once and count", () => {
  const r = run({ payload: { cards: [raw(4), raw(3), raw(1), raw(2)], page: OK_PAGE } });
  assert.equal(r.notes.length, 1);
  assert.match(r.notes[0].title, /2 new/);
  assert.match(r.notes[0].body, /Job 4/);
  assert.equal(r.status.newToday, 2);
  assert.equal(r.reply.enabled, true);
  assert.equal(r.reply.nextDelayMs, 600000);
  assert.equal(r.state.postings.length, 4); // 2 baseline + 2 new
  assert.deepEqual(r.state.postings.filter((p) => p.notified).map((p) => p.id), ["4", "3"]);
});

test("zero cards once is a failure, twice halts with no-results", () => {
  const empty = { cards: [], page: OK_PAGE };
  const first = run({ payload: empty });
  assert.equal(first.status.consecutiveFailures, 1);
  assert.equal(first.status.state, "running");
  const second = run({ payload: empty, status: first.status });
  assert.equal(second.status.state, "halted");
  assert.equal(second.status.haltReason, "no-results");
});

test("baseline run notifies nothing", () => {
  const r = run({ state: emptyState() });
  assert.equal(r.notes.length, 0);
  assert.ok(r.state.baselineAt);
});

test("outside active hours the poll is not recorded", () => {
  const night = parseWatchConfig({ search_url: cfg.searchUrl, active_hours: "08:00-09:00" });
  const r = run({ cfg: night, payload: { cards: [raw(9)], page: OK_PAGE } });
  assert.equal(r.reply.enabled, true);
  assert.equal(r.reply.nextDelayMs, 15 * 60_000);
  assert.equal(r.status.lastPollAt, null);
  assert.equal(r.notes.length, 0);
});

test("stopped status stores nothing and disables the extension", () => {
  const state = baselined();
  const r = run({ state, status: { ...emptyStatus(), state: "stopped" }, payload: { cards: [raw(9)], page: OK_PAGE } });
  assert.equal(r.reply.enabled, false);
  assert.deepEqual(r.state, state);
  assert.equal(r.status.lastHeartbeatAt, NOW.toISOString());
});

test("a manual run ignores active hours and clears the request", () => {
  const night = parseWatchConfig({ search_url: cfg.searchUrl, active_hours: "08:00-09:00" });
  const status = { ...running(), runNowRequestedAt: NOW.toISOString() };
  const r = run({ cfg: night, status, payload: { cards: [raw(1), raw(2), raw(9)], page: OK_PAGE } });
  assert.equal(r.status.runNowRequestedAt, null);
  assert.equal(r.status.lastPollAt, NOW.toISOString());
  assert.equal(r.notes.length, 1);
});

test("a manual run still stops on a halt page", () => {
  const status = { ...running(), runNowRequestedAt: NOW.toISOString() };
  const r = run({ status, payload: { cards: [], page: { ...OK_PAGE, url: "https://www.linkedin.com/authwall" } } });
  assert.equal(r.status.state, "halted");
});

test("postings that triggered a notification are marked notified", () => {
  const r = run({ payload: { cards: [raw(4), raw(1), raw(2)], page: OK_PAGE } });
  assert.equal(r.notes.length, 1);
  assert.equal(r.state.postings.find((p) => p.id === "4").notified, true);
});

test("the status says how many of the last poll were new, and when it was the first scan", () => {
  const first = run({ state: emptyState() });
  assert.equal(first.status.lastBaseline, true);
  assert.equal(first.status.lastNewCount, 0);
  assert.equal(first.status.lastKeptCount, 2);
  const none = run({});
  assert.equal(none.status.lastBaseline, false);
  assert.equal(none.status.lastNewCount, 0);
  const two = run({ payload: { cards: [raw(4), raw(3), raw(1), raw(2)], page: OK_PAGE } });
  assert.equal(two.status.lastNewCount, 2);
  assert.equal(two.status.lastCardCount, 4);
});

test("with a filter, new counts only matching postings while the match count covers the whole page", () => {
  const keep = (c) => c.id !== "4";
  const r = run({ keep, payload: { cards: [raw(4), raw(3), raw(1), raw(2)], page: OK_PAGE } });
  assert.equal(r.status.lastCardCount, 4);
  assert.equal(r.status.lastKeptCount, 3); // 4 is filtered out
  assert.equal(r.status.lastNewCount, 1); // only 3 is new and kept
});

test("the status records what the extension reported about paging, and how many pages were asked for", () => {
  const first = run({ state: emptyState(), payload: { cards: [raw(1)], page: OK_PAGE, pages: 1, stop: "no-next-button", pager: ["Page 1", "Page 2", "Next"], version: "0.4.1" } });
  assert.deepEqual(first.status.lastRead, { requested: cfg.deepPages, version: "0.4.1", stop: "no-next-button", pager: ["Page 1", "Page 2", "Next"], diag: null });
  const later = run({ payload: { cards: [raw(1), raw(2)], page: OK_PAGE } }); // an old extension reports nothing
  assert.deepEqual(later.status.lastRead, { requested: cfg.pagesPerPoll, version: null, stop: null, pager: [], diag: null });
  const manual = run({ status: { ...running(), runNowRequestedAt: NOW.toISOString() } });
  assert.equal(manual.status.lastRead.requested, cfg.deepPages);
  const junk = run({ payload: { cards: [raw(1)], page: OK_PAGE, version: 5, stop: {}, pager: "Next" } });
  assert.deepEqual(junk.status.lastRead, { requested: cfg.pagesPerPoll, version: null, stop: null, pager: [], diag: null });
});

test("page diagnostics are kept, trimmed to short strings", () => {
  const diag = { visibility: "hidden", focused: false, urlAfter: "/jobs/search-results/?" + "a".repeat(400), cardsNow: 25, extra: "ignored" };
  const r = run({ payload: { cards: [raw(1)], page: OK_PAGE, version: "0.5.0", stop: "last-page", pager: ["Next"], diag } });
  const d = r.status.lastRead.diag;
  assert.equal(d.urlAfter.length, 200);
  assert.deepEqual([d.visibility, d.focused, d.cardsNow], ["hidden", false, 25]);
  assert.ok(!("extra" in d));
});
