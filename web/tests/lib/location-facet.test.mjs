import assert from "node:assert/strict";
import { test } from "node:test";
import { locationMatches } from "../../src/lib/location-facet.mjs";
import { inferCountries, locationKeys } from "../../src/lib/location-geo.mjs";

const finds = (location, query) => locationMatches(locationKeys(location), query);

test("Indonesia finds Indonesian cities and regions that omit the country", () => {
  for (const place of [
    "Sleman, Yogyakarta Special Region",
    "Yogyakarta, Yogyakarta Special Region",
    "Bantul, Yogyakarta Special Region",
    "Bandung, West Java",
    "West Jakarta, Jakarta",
    "Tulungagung, East Java",
    "Surabaya",
  ]) {
    assert.ok(finds(place, "Indonesia"), place);
    assert.ok(finds(place, "indonesia"), place);
  }
});

test("spellings people type still match: Jogja finds Yogyakarta, and plain text still works", () => {
  assert.ok(finds("Sleman, Yogyakarta Special Region", "jogja"));
  assert.ok(finds("West Jakarta, Jakarta", "jakarta"));
  assert.ok(finds("Yogyakarta, Yogyakarta Special Region", "yogyakarta"));
  assert.ok(!finds("Sleman, Yogyakarta Special Region", "jakarta"));
});

test("it works for other countries too, without a hand-kept list", () => {
  assert.ok(finds("Kraków", "poland"));
  assert.ok(finds("Warszawa", "poland"));
  assert.ok(finds("Wrocław", "poland"));
  assert.ok(finds("Lisboa", "portugal"));
  assert.ok(finds("Toronto", "canada"));
  assert.ok(finds("Bengaluru", "india"));
  assert.ok(finds("Johor Bahru", "malaysia"));
  assert.ok(finds("Cebu City", "philippines"));
});

test("other countries stay out of Indonesia", () => {
  assert.ok(!finds("Warszawa", "indonesia"));
  assert.ok(!finds("Lisboa", "indonesia"));
  assert.ok(!finds("USA Only", "indonesia"));
  assert.ok(!finds("", "indonesia"));
});

test("an explicit country beats a city guess, and several countries are all kept", () => {
  assert.deepEqual(inferCountries("Paris, Texas, United States"), ["United States"]);
  assert.deepEqual(inferCountries("Paris"), ["France"]);
  assert.deepEqual(inferCountries("Canada · San Francisco · United States").sort(), ["Canada", "United States"]);
});

test("whole words only: Indiana is not India, and an empty query matches everything", () => {
  assert.ok(!inferCountries("Indianapolis, Indiana").includes("India"));
  assert.ok(locationMatches(locationKeys("anything"), ""));
});
