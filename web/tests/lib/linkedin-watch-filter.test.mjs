import test from "node:test";
import assert from "node:assert/strict";
import { buildCardFilter, hasFilters } from "../../src/lib/linkedin-watch/filter.mjs";

const NONE = { positive: [], negative: [], allow: [], block: [], blockHard: [], alwaysAllow: [] };

test("no filters means no filter at all, and the core is never loaded", async () => {
  assert.equal(hasFilters(NONE), false);
  assert.equal(await buildCardFilter(NONE, () => { throw new Error("must not load"); }), null);
});

test("filters are compiled with the scanner's own title and location builders", async () => {
  const calls = [];
  const core = {
    buildTitleFilter: (cfg) => { calls.push(["title", cfg]); return (t) => t.includes("Backend"); },
    buildLocationFilter: (cfg) => { calls.push(["location", cfg]); return (text) => /indonesia/i.test(text); },
  };
  const keep = await buildCardFilter({ ...NONE, positive: ["Backend"], allow: ["Indonesia"], blockHard: ["India"], alwaysAllow: ["Remote"] }, async () => core);
  assert.deepEqual(calls[0], ["title", { positive: ["Backend"], negative: [] }]);
  assert.deepEqual(calls[1], ["location", { allow: ["Indonesia"], block: [], block_hard: ["India"], always_allow: ["Remote"], remote_title_fallback: false }]);
  assert.equal(keep({ title: "Backend Engineer", location: "Jakarta, Indonesia", link: "" }), true);
  assert.equal(keep({ title: "Chef", location: "Jakarta, Indonesia", link: "" }), false);
  assert.equal(keep({ title: "Backend Engineer", location: "Austin, USA", link: "" }), false);
});

test("a city-only location is matched through the country the city dataset knows", async () => {
  const core = { buildTitleFilter: () => () => true, buildLocationFilter: () => (text) => /indonesia/i.test(text) };
  const keep = await buildCardFilter({ ...NONE, allow: ["Indonesia"] }, async () => core);
  assert.equal(keep({ title: "Software Engineer", location: "Jakarta", link: "" }), true);
});

test("filters without a core loader fail loudly (the caller fails open)", async () => {
  await assert.rejects(() => buildCardFilter({ ...NONE, positive: ["x"] }, undefined), /core scanner/);
});
