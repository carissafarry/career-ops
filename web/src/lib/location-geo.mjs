// Server only. Works out which countries a free-text job location implies, using
// the GeoNames city dataset in the `all-the-cities` package (MIT code, GeoNames
// data under CC BY 4.0) and the country names built into Node (Intl.DisplayNames).
//
// The result goes into `locationKeys`, a lowercase string the inbox's location box
// searches, so "Indonesia" finds a Sleman posting and "Jogja" finds Yogyakarta, for
// any country, with no hand-kept city list. The dataset is about 6 MB, so this stays
// on the server; the browser only receives the finished strings.

import cities from "all-the-cities";
import { normalizeLocation } from "./location-facet.mjs";
import { SPELLINGS } from "./location-spellings.mjs";

// Region and administrative words that follow a place name ("Yogyakarta Special Region").
const TAIL_WORDS = new Set(["special", "region", "province", "state", "county", "district", "regency", "prefecture", "governorate", "metropolitan", "area", "city", "capital", "territory"]);
// Direction and status words that precede one ("West Jakarta", "Greater London").
const HEAD_WORDS = new Set(["west", "east", "north", "south", "central", "greater", "northern", "southern", "eastern", "western", "kota", "kabupaten", "city", "district", "the"]);
// A bare country name or code that job boards write.
const COUNTRY_EXTRAS = { usa: "US", "u s a": "US", uk: "GB", "great britain": "GB", england: "GB", scotland: "GB", wales: "GB", uae: "AE", korea: "KR", "south korea": "KR", czechia: "CZ", "czech republic": "CZ", turkiye: "TR", "ivory coast": "CI", russia: "RU", vietnam: "VN", "united states of america": "US" };

let countryNames; // normalized name -> ISO code
let displayNames;
let cityIndex; // normalized name -> { country, population }

function regionName(code) {
  displayNames ??= new Intl.DisplayNames(["en"], { type: "region" });
  try {
    return displayNames.of(code) ?? code;
  } catch {
    return code;
  }
}

function buildCountryNames() {
  const map = new Map();
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  for (const a of letters) {
    for (const b of letters) {
      const code = a + b;
      const name = regionName(code);
      if (name && name !== code) map.set(normalizeLocation(name), code);
    }
  }
  for (const [name, code] of Object.entries(COUNTRY_EXTRAS)) map.set(normalizeLocation(name), code);
  return map;
}

function buildCityIndex() {
  const map = new Map();
  const add = (name, city) => {
    const key = normalizeLocation(name);
    if (!key) return;
    const known = map.get(key);
    if (!known || city.population > known.population) map.set(key, { country: city.country, population: city.population });
  };
  for (const city of cities) {
    add(city.name, city);
    // Alternate names add reach (exonyms) but also collisions, so only big cities get them.
    if (city.population >= 100000 && city.altName) for (const alt of String(city.altName).split(",")) add(alt, city);
  }
  return map;
}

const hasWord = (text, needle) => ` ${text} `.includes(` ${needle} `);
const canonicalOf = new Map(SPELLINGS.map(([spelling, canonical]) => [spelling, canonical]));

function segmentsOf(location) {
  return String(location ?? "")
    .split(/[,;|·•/]|\s[-–—]\s/)
    .map(normalizeLocation)
    .filter(Boolean);
}

/** ISO country codes a location text implies, an explicit country name winning over a city guess. */
export function inferCountryCodes(location) {
  const text = normalizeLocation(location);
  if (!text) return [];
  countryNames ??= buildCountryNames();
  const explicit = [];
  for (const [name, code] of countryNames) {
    if (name.length >= 3 && hasWord(text, name) && !explicit.includes(code)) explicit.push(code);
  }
  if (explicit.length) return explicit;

  cityIndex ??= buildCityIndex();
  const found = [];
  for (const segment of segmentsOf(location)) {
    // A bare two-letter ISO code ("PL", "UA"), only when it is the whole segment.
    if (/^[a-z]{2}$/.test(segment)) {
      const code = segment.toUpperCase();
      if (regionName(code) !== code && !found.includes(code)) found.push(code);
      continue;
    }
    let words = segment.split(" ");
    const lookup = (name) => cityIndex.get(name) ?? cityIndex.get(canonicalOf.get(name) ?? "");
    let hit = lookup(words.join(" "));
    // Drop trailing region words, then leading direction words, until something matches.
    while (!hit && words.length > 1) {
      if (TAIL_WORDS.has(words[words.length - 1])) words = words.slice(0, -1);
      else if (HEAD_WORDS.has(words[0])) words = words.slice(1);
      else break;
      hit = lookup(words.join(" "));
    }
    if (hit && !found.includes(hit.country)) found.push(hit.country);
  }
  return found;
}

/** Country names (English) a location implies. */
export function inferCountries(location) {
  return inferCountryCodes(location).map(regionName);
}

/**
 * The lowercase string the inbox searches for one posting's location: the text as
 * written, its accent-stripped form, the countries it implies, and the spellings
 * people use for the places in it.
 */
export function locationKeys(location) {
  const raw = String(location ?? "");
  const text = normalizeLocation(raw);
  const extras = inferCountries(raw).map((country) => country.toLowerCase());
  for (const [spelling, canonical] of SPELLINGS) {
    if (hasWord(text, canonical)) extras.push(spelling);
    if (hasWord(text, spelling)) extras.push(canonical);
  }
  return [raw.toLowerCase(), text, ...extras].join(" | ");
}
