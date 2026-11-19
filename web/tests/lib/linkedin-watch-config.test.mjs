import test from "node:test";
import assert from "node:assert/strict";
import {
  parseWatchConfig,
  WatchConfigError,
  nextDelayMs,
  withinActiveHours,
  pollsAllowed,
} from "../../src/lib/linkedin-watch/config.mjs";

const URL_OK = "https://www.linkedin.com/jobs/search/?f_TPR=r86400&sortBy=DD&keywords=x";

test("minimal config gets defaults", () => {
  const cfg = parseWatchConfig({ search_url: URL_OK });
  assert.equal(cfg.intervalMinutes, 10);
  assert.equal(cfg.jitterPercent, 30);
  assert.equal(cfg.maxPollsPerDay, 150);
  assert.equal(cfg.activeHours, null);
});

test("interval below 5 is refused", () => {
  assert.throws(() => parseWatchConfig({ search_url: URL_OK, interval_minutes: 4 }), (e) => e instanceof WatchConfigError && /5/.test(e.message));
});

test("only https LinkedIn jobs search URLs are accepted", () => {
  for (const bad of ["https://example.com/jobs/search/", "https://www.linkedin.com/in/someone", "http://www.linkedin.com/jobs/search/", "nonsense"]) {
    assert.throws(() => parseWatchConfig({ search_url: bad }), WatchConfigError);
  }
});

test("active_hours parses and rejects bad times", () => {
  assert.deepEqual(parseWatchConfig({ search_url: URL_OK, active_hours: "08:00-23:00" }).activeHours, { startMin: 480, endMin: 1380 });
  assert.throws(() => parseWatchConfig({ search_url: URL_OK, active_hours: "25:00-26:00" }), WatchConfigError);
});

test("nextDelayMs spans interval +/- jitter", () => {
  const cfg = parseWatchConfig({ search_url: URL_OK });
  assert.equal(nextDelayMs(cfg, () => 0), 420000);
  assert.equal(nextDelayMs(cfg, () => 1), 780000);
  assert.equal(nextDelayMs(cfg, () => 0.5), 600000);
});

test("withinActiveHours", () => {
  const cfg = parseWatchConfig({ search_url: URL_OK, active_hours: "08:00-23:00" });
  assert.equal(withinActiveHours(cfg, new Date(2026, 10, 19, 9, 0)), true);
  assert.equal(withinActiveHours(cfg, new Date(2026, 10, 19, 2, 0)), false);
  assert.equal(withinActiveHours(parseWatchConfig({ search_url: URL_OK }), new Date(2026, 10, 19, 2, 0)), true);
});

test("pollsAllowed counts only today", () => {
  const cfg = parseWatchConfig({ search_url: URL_OK });
  const now = new Date(2026, 10, 19, 12, 0);
  const today = Array.from({ length: 150 }, () => new Date(2026, 10, 19, 8, 0).toISOString());
  const yesterday = Array.from({ length: 150 }, () => new Date(2026, 10, 18, 8, 0).toISOString());
  assert.equal(pollsAllowed(cfg, today, now), false);
  assert.equal(pollsAllowed(cfg, yesterday, now), true);
});

test("filters default to empty lists, are trimmed and deduped, and reject bad shapes", () => {
  const empty = parseWatchConfig({ search_url: URL_OK }).filters;
  assert.deepEqual(empty, { positive: [], negative: [], allow: [], block: [], blockHard: [], alwaysAllow: [] });
  const cfg = parseWatchConfig({ search_url: URL_OK, filters: { positive: [" Backend ", "Backend", ""], blockHard: ["India"] } });
  assert.deepEqual(cfg.filters.positive, ["Backend"]);
  assert.deepEqual(cfg.filters.blockHard, ["India"]);
  assert.throws(() => parseWatchConfig({ search_url: URL_OK, filters: { positive: "Backend" } }), WatchConfigError);
  assert.throws(() => parseWatchConfig({ search_url: URL_OK, filters: [] }), WatchConfigError);
});

test("page counts default to 1 per poll and 5 deep, and are bounded", () => {
  const cfg = parseWatchConfig({ search_url: URL_OK });
  assert.equal(cfg.pagesPerPoll, 1);
  assert.equal(cfg.deepPages, 5);
  assert.equal(parseWatchConfig({ search_url: URL_OK, pages_per_poll: 3, deep_pages: 10 }).pagesPerPoll, 3);
  for (const bad of [{ pages_per_poll: 0 }, { pages_per_poll: 6 }, { pages_per_poll: 1.5 }, { deep_pages: 11 }, { deep_pages: "5" }]) {
    assert.throws(() => parseWatchConfig({ search_url: URL_OK, ...bad }), WatchConfigError);
  }
});
