// LinkedIn says "14 hours ago" at the moment a card is read; the watcher turns that into a time so the list
// can be ordered by when LinkedIn says the job was posted, not by when the watcher first saw it.
//
// Run: node --experimental-strip-types --test tests/lib/linkedin-watch-posted-age.test.mjs

import test from "node:test";
import assert from "node:assert/strict";
import { postedAtMs, byPostedNewest, formatAgeMs, postedAgeNow } from "../../src/lib/linkedin-watch/posted-age.mjs";

const SEEN = "2026-11-20T10:00:00.000Z";
const ago = (ms) => Date.parse(SEEN) - ms;
const MIN = 60_000, HOUR = 60 * MIN, DAY = 24 * HOUR;

test("reads minutes, hours, days, weeks and months, with or without a Posted/Reposted prefix", () => {
  assert.equal(postedAtMs("14 hours ago", SEEN), ago(14 * HOUR));
  assert.equal(postedAtMs("1 hour ago", SEEN), ago(HOUR));
  assert.equal(postedAtMs("30 minutes ago", SEEN), ago(30 * MIN));
  assert.equal(postedAtMs("2 days ago", SEEN), ago(2 * DAY));
  assert.equal(postedAtMs("3 weeks ago", SEEN), ago(21 * DAY));
  assert.equal(postedAtMs("1 month ago", SEEN), ago(30 * DAY));
  assert.equal(postedAtMs("Posted 6 hours ago", SEEN), ago(6 * HOUR));
  assert.equal(postedAtMs("Reposted 2 days ago", SEEN), ago(2 * DAY));
  assert.equal(postedAtMs("Promoted · 1 week ago", SEEN), ago(7 * DAY));
});

test("reads Indonesian wording too", () => {
  assert.equal(postedAtMs("6 jam yang lalu", SEEN), ago(6 * HOUR));
  assert.equal(postedAtMs("2 hari yang lalu", SEEN), ago(2 * DAY));
  assert.equal(postedAtMs("1 minggu yang lalu", SEEN), ago(7 * DAY));
});

test("just now counts as the moment it was read", () => {
  assert.equal(postedAtMs("Just now", SEEN), Date.parse(SEEN));
});

test("no usable text gives null", () => {
  assert.equal(postedAtMs("", SEEN), null);
  assert.equal(postedAtMs(undefined, SEEN), null);
  assert.equal(postedAtMs("Actively reviewing applicants", SEEN), null);
  assert.equal(postedAtMs("6 hours ago", "not a date"), null);
});

test("newest posted comes first, using LinkedIn's time, not the first-seen time", () => {
  const older = { id: "1", postedText: "20 hours ago", firstSeen: "2026-11-20T10:00:00.000Z" };
  const newer = { id: "2", postedText: "2 hours ago", firstSeen: "2026-11-20T09:00:00.000Z" }; // seen earlier, posted later
  assert.deepEqual([older, newer].sort(byPostedNewest).map((p) => p.id), ["2", "1"]);
});

test("a job read days after it was posted is still ordered by when it was posted", () => {
  const seenLate = { id: "a", postedText: "1 day ago", firstSeen: "2026-11-22T10:00:00.000Z" }; // posted about 11-21
  const seenEarly = { id: "b", postedText: "3 hours ago", firstSeen: "2026-11-20T10:00:00.000Z" }; // posted about 11-20
  assert.deepEqual([seenEarly, seenLate].sort(byPostedNewest).map((p) => p.id), ["a", "b"]);
});

test("ties and missing text fall back to first seen, newest first, and never throw", () => {
  const a = { id: "a", postedText: "5 hours ago", firstSeen: "2026-11-20T10:00:00.000Z" };
  const b = { id: "b", postedText: "5 hours ago", firstSeen: "2026-11-20T10:05:00.000Z" };
  const c = { id: "c", postedText: "", firstSeen: "2026-11-20T10:10:00.000Z" };
  assert.deepEqual([a, b, c].sort(byPostedNewest).map((p) => p.id), ["c", "b", "a"]);
});

test("reads years too", () => {
  assert.equal(postedAtMs("1 year ago", SEEN), ago(365 * DAY));
  assert.equal(postedAtMs("2 tahun yang lalu", SEEN), ago(730 * DAY));
});

const at = (iso) => Date.parse(iso);

test("an age in milliseconds reads like LinkedIn writes it", () => {
  assert.equal(formatAgeMs(20_000), "just now");
  assert.equal(formatAgeMs(MIN), "1 minute ago");
  assert.equal(formatAgeMs(45 * MIN), "45 minutes ago");
  assert.equal(formatAgeMs(HOUR), "1 hour ago");
  assert.equal(formatAgeMs(3 * HOUR + 40 * MIN), "3 hours ago");
  assert.equal(formatAgeMs(23 * HOUR + 59 * MIN), "23 hours ago");
  assert.equal(formatAgeMs(DAY), "1 day ago");
  assert.equal(formatAgeMs(6 * DAY + 23 * HOUR), "6 days ago");
  assert.equal(formatAgeMs(7 * DAY), "1 week ago");
  assert.equal(formatAgeMs(15 * DAY), "2 weeks ago");
  assert.equal(formatAgeMs(30 * DAY), "1 month ago");
  assert.equal(formatAgeMs(75 * DAY), "2 months ago");
  assert.equal(formatAgeMs(400 * DAY), "1 year ago");
  assert.equal(formatAgeMs(-5 * MIN), "just now", "a clock a little behind never shows a negative age");
});

test("a job that was 1 hour old when read at 1 pm is 3 hours old at 3 pm", () => {
  const p = { postedText: "1 hour ago", firstSeen: "2026-11-20T13:00:00.000Z" };
  assert.equal(postedAgeNow(p, at("2026-11-20T13:00:00.000Z")), "1 hour ago");
  assert.equal(postedAgeNow(p, at("2026-11-20T15:00:00.000Z")), "3 hours ago");
  assert.equal(postedAgeNow(p, at("2026-11-21T15:00:00.000Z")), "1 day ago");
});

test("a posting without a readable age has no live age", () => {
  assert.equal(postedAgeNow({ postedText: "", firstSeen: "2026-11-20T13:00:00.000Z" }, Date.now()), null);
});
