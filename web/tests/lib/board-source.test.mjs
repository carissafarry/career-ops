// A job board is read through its provider; the title and location filters, the
// age window and the dedup all run in the worker, so Explore and the scan agree.
//
// Run: node --experimental-strip-types --test tests/lib/board-source.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { scanBoard, describeFailure, MAX_TERMS } from "../../src/lib/core/board-source.mjs";
import { BOARD_SOURCES, BOARD_ENTRIES, BOARD_LABEL, isBoardSource } from "../../src/lib/board-sources.mjs";

const NOW = Date.parse("2026-11-18T12:00:00Z");
// The scanner's own filters are substring matches for the cases used here.
const core = {
  buildTitleFilter: ({ positive = [], negative = [] }) => (title) => {
    const t = title.toLowerCase();
    if (negative.some((n) => t.includes(n.toLowerCase()))) return false;
    return positive.length === 0 || positive.some((p) => t.includes(p.toLowerCase()));
  },
  buildLocationFilter: ({ allow = [] }) => (location) =>
    allow.length === 0 || allow.some((a) => String(location || "").toLowerCase().includes(a.toLowerCase())),
  normalizeUrlForDedup: (url) => url.replace(/\/$/, "").toLowerCase(),
};
const job = (over) => ({ title: "Management Trainee", company: "Acme", url: "https://x.test/1", location: "Jakarta", postedAt: NOW - 86_400_000, ...over });

test("every board has a label and a provider entry", () => {
  for (const id of BOARD_SOURCES) {
    assert.ok(BOARD_LABEL[id], `${id} label`);
    assert.equal(BOARD_ENTRIES[id].provider, id);
    assert.equal(isBoardSource(id), true);
  }
  assert.equal(isBoardSource("greenhouse"), false);
});

test("a searchable board gets one query per term; the others are read once", async () => {
  const seen = [];
  const provider = { fetch: async (entry) => (seen.push(entry.searchKeywords), []) };
  await scanBoard("jobstreet", { terms: ["Management Trainee", "Graduate Program", "Management Trainee"], sinceDays: 7 }, { provider, core, http: {}, now: NOW });
  assert.deepEqual(seen, ["Management Trainee", "Graduate Program"]);

  const whole = [];
  const feed = { fetch: async (entry) => (whole.push(entry.searchKeywords), []) };
  await scanBoard("himalayas", { terms: ["Management Trainee"], sinceDays: 7 }, { provider: feed, core, http: {}, now: NOW });
  assert.deepEqual(whole, [undefined]);
});

test("no terms searches the whole searchable board once", async () => {
  const seen = [];
  const provider = { fetch: async (entry) => (seen.push(entry.searchKeywords), []) };
  await scanBoard("kalibrr", { terms: [], sinceDays: 7 }, { provider, core, http: {}, now: NOW });
  assert.deepEqual(seen, [""]);
});

test("terms are capped", async () => {
  const seen = [];
  const provider = { fetch: async (entry) => (seen.push(entry.searchKeywords), []) };
  const terms = Array.from({ length: MAX_TERMS + 4 }, (_, i) => `role ${i}`);
  await scanBoard("jobstreet", { terms, sinceDays: 7 }, { provider, core, http: {}, now: NOW });
  assert.equal(seen.length, MAX_TERMS);
});

test("title, location and age filters apply, and one posting is kept once", async () => {
  const provider = {
    fetch: async () => [
      job({ url: "https://x.test/keep" }),
      job({ url: "https://x.test/keep/" }), // same posting, trailing slash
      job({ url: "https://x.test/senior", title: "Senior Management Trainee" }),
      job({ url: "https://x.test/abroad", location: "Berlin" }),
      job({ url: "https://x.test/old", postedAt: NOW - 30 * 86_400_000 }),
      job({ url: "https://x.test/undated", postedAt: undefined }),
    ],
  };
  const request = { terms: ["Management Trainee"], titleFilter: { positive: ["Management Trainee"], negative: ["Senior"] }, locationFilter: { allow: ["Jakarta"] }, sinceDays: 7 };
  const result = await scanBoard("jobstreet", request, { provider, core, http: {}, now: NOW });
  assert.equal(result.state, "complete");
  assert.deepEqual(result.offers.map((o) => o.url), ["https://x.test/keep", "https://x.test/undated"]);
  assert.equal(result.offers[0].ats, "jobstreet");
  assert.equal(result.offers[0].postedAt, "2026-11-17");
  assert.equal(result.offers[1].postedAt, "");
});

test("a board that fails every query is failed; one that fails some is incomplete", async () => {
  const down = { fetch: async () => { throw new Error("HTTP 403 <html>Firewall</html>"); } };
  const failed = await scanBoard("glints", { terms: ["a", "b"], sinceDays: 7 }, { provider: down, core, http: {}, now: NOW });
  assert.equal(failed.state, "failed");
  assert.match(failed.reason, /HTTP 403/);
  assert.doesNotMatch(failed.reason, /</);

  let n = 0;
  const flaky = { fetch: async () => { if (n++ === 0) throw new Error("boom"); return [job()]; } };
  const partial = await scanBoard("jobstreet", { terms: ["a", "b"], sinceDays: 7 }, { provider: flaky, core, http: {}, now: NOW });
  assert.equal(partial.state, "incomplete");
  assert.equal(partial.offers.length, 1);
});

test("a failure reason is short and has no markup", () => {
  assert.match(describeFailure("HTTP 429 slow down"), /HTTP 429/);
  assert.equal(describeFailure("HTTP 500 oops"), "HTTP 500");
  assert.equal(describeFailure("<p>bad  gateway</p>"), "bad gateway");
  assert.equal(describeFailure(""), "the board could not be read");
});
