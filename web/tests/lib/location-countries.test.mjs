// The country buttons: one click includes, the next excludes, the next clears.
//
// Run: node --experimental-strip-types --test tests/lib/location-countries.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { countryState, cycleCountry, listOf, textOf } from "../../src/lib/location-countries.mjs";
import { locationMatchesAny } from "../../src/lib/location-facet.mjs";

test("a country goes none -> include -> exclude -> none", () => {
  let lists = { include: [], exclude: [] };
  lists = cycleCountry(lists.include, lists.exclude, "Indonesia");
  assert.deepEqual(lists, { include: ["Indonesia"], exclude: [] });
  lists = cycleCountry(lists.include, lists.exclude, "Indonesia");
  assert.deepEqual(lists, { include: [], exclude: ["Indonesia"] });
  lists = cycleCountry(lists.include, lists.exclude, "Indonesia");
  assert.deepEqual(lists, { include: [], exclude: [] });
});

test("other entries in the lists are kept", () => {
  const next = cycleCountry(["Bali"], ["Jogja"], "Singapore");
  assert.deepEqual(next, { include: ["Bali", "Singapore"], exclude: ["Jogja"] });
});

test("a country typed by hand in another case still counts", () => {
  assert.equal(countryState(["indonesia"], [], "Indonesia"), "include");
  assert.equal(countryState([], ["INDONESIA"], "Indonesia"), "exclude");
  assert.equal(countryState([], [], "Indonesia"), "none");
});

test("a comma box is a list and back", () => {
  assert.deepEqual(listOf(" Jogja, Bali ,, "), ["Jogja", "Bali"]);
  assert.equal(textOf(["Jogja", "Bali"]), "Jogja, Bali");
});

test("the include box matches any place in its comma list", () => {
  assert.equal(locationMatchesAny("denpasar, bali | indonesia", "Singapore, Indonesia"), true);
  assert.equal(locationMatchesAny("tokyo | japan", "Singapore, Indonesia"), false);
  assert.equal(locationMatchesAny("tokyo | japan", ""), true);
});
