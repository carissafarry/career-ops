// "All Indonesia, except Jogja": the exclude box hides postings by place (any of a
// comma list), and the scan filters widen a place to its other spellings.
//
// Run: node --experimental-strip-types --test tests/lib/location-exclude.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { locationExcluded, locationMatches } from "../../src/lib/location-facet.mjs";
import { expandLocationTerms } from "../../src/lib/location-spellings.mjs";
import { serializePortals } from "../../src/lib/core/portals-serialize.mjs";

const keys = (text) => text.toLowerCase();

test("an empty exclude box hides nothing", () => {
  assert.equal(locationExcluded(keys("Sleman, Yogyakarta"), ""), false);
  assert.equal(locationExcluded(keys("Sleman, Yogyakarta"), " , "), false);
});

test("any place in the comma list hides the posting", () => {
  assert.equal(locationExcluded(keys("Sleman, Yogyakarta Special Region"), "Yogyakarta"), true);
  assert.equal(locationExcluded(keys("Denpasar, Bali"), "Jogja, Bali"), true);
  assert.equal(locationExcluded(keys("Bandung, West Java"), "Jogja, Bali"), false);
});

test("a country include with a place exclude keeps the rest of the country", () => {
  const jogja = keys("Sleman, Yogyakarta Special Region | indonesia | jogja");
  const bandung = keys("Bandung, West Java | indonesia");
  for (const [place, kept] of [[jogja, false], [bandung, true]]) {
    const shown = locationMatches(place, "Indonesia") && !locationExcluded(place, "Jogja");
    assert.equal(shown, kept);
  }
});

test("a place is widened to its other spellings", () => {
  assert.deepEqual(expandLocationTerms(["Jogja"]), ["Jogja", "yogyakarta", "jogjakarta", "diy"]);
  assert.deepEqual(expandLocationTerms(["Yogyakarta", "Jogja"]), ["Yogyakarta", "jogja", "jogjakarta", "diy"]);
  assert.deepEqual(expandLocationTerms(["Bali"]), ["Bali"]);
  assert.deepEqual(expandLocationTerms(undefined), []);
});

test("the scan file lists the other spellings of an excluded place", () => {
  const text = serializePortals({ positive: [], negative: [], allow: ["Indonesia"], block: ["Jogja"], blockHard: [], alwaysAllow: [] });
  assert.match(text, /block:\n    - "Jogja"\n    - "yogyakarta"/);
  assert.match(text, /allow:\n    - "Indonesia"\n/);
});
