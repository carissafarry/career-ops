// Saved Explore filters keep a filter set as its URL query and restore it through
// the same codec Explore uses, so what comes back is what was saved.
//
// Run: node --experimental-strip-types --test tests/lib/saved-filters.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanName, filtersOf, sameFilters } from "../../src/lib/saved-filters-core.mjs";
import { DEFAULT_FILTERS, filtersToParams } from "../../src/lib/explore.ts";

const mine = {
  ...DEFAULT_FILTERS,
  positive: ["backend", "full stack"],
  negative: ["senior", "lead"],
  allow: ["Remote", "Indonesia"],
  block: ["Pakistan"],
  blockHard: ["India"],
  alwaysAllow: ["Jakarta"],
  ats: ["greenhouse", "lever"],
  sinceDays: 3,
  limitPerAts: 250,
};

test("a saved set restores exactly the filters that were saved", () => {
  const saved = { id: "a", name: "Backend", query: filtersToParams(mine) };
  assert.deepEqual(filtersOf(saved), mine);
  assert.equal(sameFilters(saved, mine), true);
});

test("a set that differs in any list or number is not the same", () => {
  const saved = { id: "a", name: "Backend", query: filtersToParams(mine) };
  assert.equal(sameFilters(saved, { ...mine, positive: ["management trainee"] }), false);
  assert.equal(sameFilters(saved, { ...mine, sinceDays: 7 }), false);
});

test("an empty set restores to the defaults", () => {
  assert.deepEqual(filtersOf({ id: "b", name: "Empty", query: "" }), DEFAULT_FILTERS);
});

test("a name is trimmed, collapsed and capped", () => {
  assert.equal(cleanName("  Management   trainee "), "Management trainee");
  assert.equal(cleanName("x".repeat(60)).length, 40);
  assert.equal(cleanName("   "), "");
});
