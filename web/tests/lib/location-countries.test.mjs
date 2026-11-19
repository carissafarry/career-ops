// The country buttons: one click includes, the next excludes, the next clears.
//
// Run: node --experimental-strip-types --test tests/lib/location-countries.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { countryState, cycleCountry, listOf, textOf, REGIONS, regionState, toggleRegion, NO_COUNTRY, toggleNoCountry } from "../../src/lib/location-countries.mjs";
import { locationMatchesAny } from "../../src/lib/location-facet.mjs";
import { locationKeys } from "../../src/lib/location-geo.mjs";

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

test("ASEAN is the ten member states and APAC contains all of them", () => {
  assert.equal(REGIONS.ASEAN.length, 10);
  for (const c of REGIONS.ASEAN) assert.ok(REGIONS.APAC.includes(c), c);
  for (const c of ["India", "Australia", "Japan"]) assert.ok(REGIONS.APAC.includes(c), c);
});

test("a region button includes every member and a second click removes them", () => {
  let lists = toggleRegion(["Bali"], [], "ASEAN");
  assert.deepEqual(lists.include, ["Bali", ...REGIONS.ASEAN]);
  assert.equal(regionState(lists.include, "ASEAN"), "include");
  lists = toggleRegion(lists.include, lists.exclude, "ASEAN");
  assert.deepEqual(lists, { include: ["Bali"], exclude: [] });
});

test("a region adds only the missing members and lifts them out of the exclude list", () => {
  const lists = toggleRegion(["indonesia", "Singapore"], ["Thailand", "Japan"], "ASEAN");
  assert.equal(lists.include.filter((c) => c.toLowerCase() === "indonesia").length, 1);
  assert.deepEqual(lists.exclude, ["Japan"]);
  assert.equal(regionState(lists.include, "ASEAN"), "include");
});

test("a region is partial while only some members are included", () => {
  assert.equal(regionState(["Indonesia"], "ASEAN"), "partial");
  assert.equal(regionState([], "ASEAN"), "none");
  assert.equal(regionState(["Indonesia"], "APAC"), "partial");
});

test("a partial region click completes it", () => {
  const lists = toggleRegion(["Indonesia"], [], "ASEAN");
  assert.equal(regionState(lists.include, "ASEAN"), "include");
});

test("the other regions exist and every member is a real country name", () => {
  assert.deepEqual(Object.keys(REGIONS), ["ASEAN", "APAC", "EU", "Europe", "Middle East", "North America", "Latin America", "South Asia"]);
  const known = new Set(Array.from("ABCDEFGHIJKLMNOPQRSTUVWXYZ", (a) => Array.from("ABCDEFGHIJKLMNOPQRSTUVWXYZ", (b) => { try { return new Intl.DisplayNames(["en"], { type: "region" }).of(a + b); } catch { return ""; } })).flat().map((n) => n.toLowerCase()));
  for (const [region, members] of Object.entries(REGIONS)) {
    assert.equal(new Set(members).size, members.length, `${region} lists a country twice`);
    for (const c of members) assert.ok([...known].some((n) => n.includes(c.toLowerCase())) || ["Vietnam", "South Korea"].includes(c), `${region}: ${c}`);
  }
  assert.equal(REGIONS.EU.length, 27);
});

test("clicking EU leaves an ASEAN selection alone", () => {
  const lists = toggleRegion(toggleRegion([], [], "ASEAN").include, [], "EU");
  assert.equal(regionState(lists.include, "ASEAN"), "include");
  assert.equal(regionState(lists.include, "EU"), "include");
});

test("Europe includes every EU member", () => {
  for (const c of REGIONS.EU) assert.ok(REGIONS.Europe.includes(c), c);
  assert.ok(REGIONS.Europe.includes("United Kingdom"));
});

test("a location with no country gets the no-country marker, one with a country does not", () => {
  assert.ok(locationKeys("Remote").includes(NO_COUNTRY.toLowerCase()));
  assert.ok(locationKeys("").includes(NO_COUNTRY.toLowerCase()));
  assert.ok(!locationKeys("Jakarta, Indonesia").includes(NO_COUNTRY.toLowerCase()));
  assert.ok(!locationKeys("Sleman, Yogyakarta Special Region").includes(NO_COUNTRY.toLowerCase()));
});

test("the no-country entry finds a bare Remote posting next to a region", () => {
  const include = toggleNoCountry(toggleRegion([], [], "ASEAN").include).join(", ");
  assert.equal(locationMatchesAny(locationKeys("Remote"), include), true);
  assert.equal(locationMatchesAny(locationKeys("Singapore"), include), true);
  assert.equal(locationMatchesAny(locationKeys("Berlin, Germany"), include), false);
});

test("the no-country entry on its own shows only postings with no country", () => {
  assert.equal(locationMatchesAny(locationKeys("Remote"), NO_COUNTRY), true);
  assert.equal(locationMatchesAny(locationKeys("Jakarta, Indonesia"), NO_COUNTRY), false);
});

test("toggleNoCountry adds the entry once and removes it on the second click", () => {
  const on = toggleNoCountry(["Indonesia"]);
  assert.deepEqual(on, ["Indonesia", NO_COUNTRY]);
  assert.deepEqual(toggleNoCountry(on), ["Indonesia"]);
  assert.deepEqual(toggleNoCountry(["no country listed"]), []);
});
