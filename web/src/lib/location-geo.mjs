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
import { SPELLINGS, expandLocationTerms } from "./location-spellings.mjs";

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

// Provinces that job boards write after a city with no country ("Bandung, West Java"),
// so a bare country name can still find those postings. Only where the city list alone
// leaves gaps; every other country is covered by its cities.
const REGIONS = {
  ID: [
    "Aceh", "North Sumatra", "West Sumatra", "Riau", "Riau Islands", "Jambi", "South Sumatra", "Bengkulu", "Lampung",
    "Bangka Belitung", "Jakarta", "Banten", "West Java", "Central Java", "East Java", "Yogyakarta", "Bali",
    "West Nusa Tenggara", "East Nusa Tenggara", "West Kalimantan", "Central Kalimantan", "South Kalimantan",
    "East Kalimantan", "North Kalimantan", "North Sulawesi", "Central Sulawesi", "South Sulawesi", "Southeast Sulawesi",
    "Gorontalo", "West Sulawesi", "Maluku", "North Maluku",
  ],
};

let bigCityCountryIndex; // normalized name -> countries that have a big city of that name
function bigCityCountries() {
  if (!bigCityCountryIndex) {
    bigCityCountryIndex = new Map();
    for (const city of cities) {
      if (city.population < COUNTRY_CITY_MIN_POPULATION) continue;
      const key = normalizeLocation(city.name);
      if (!bigCityCountryIndex.has(key)) bigCityCountryIndex.set(key, new Set());
      bigCityCountryIndex.get(key).add(city.country);
    }
  }
  return bigCityCountryIndex;
}

const COUNTRY_CITY_LIMIT = 250;
const COUNTRY_CITY_MIN_POPULATION = 50000;

/**
 * A scan matches a place by the words in a posting's location, and many boards write
 * only "Bandung, West Java". So a country name in a location list is widened to the
 * country, its biggest cities and, where known, its provinces. Anything that is not a
 * country name is returned as typed.
 *
 * @param {string[]} terms
 * @returns {string[]}
 */
export function expandCountryTerms(terms) {
  countryNames ??= buildCountryNames();
  const uniqueTo = (city) => bigCityCountries().get(normalizeLocation(city.name))?.size === 1;
  const out = [];
  const seen = new Set();
  const add = (term) => {
    const key = normalizeLocation(term);
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push(term);
  };
  for (const term of Array.isArray(terms) ? terms : []) {
    if (typeof term !== "string") continue;
    add(term);
    const key = normalizeLocation(term);
    const code = key.length >= 3 ? countryNames.get(key) : undefined;
    if (!code) continue;
    add(regionName(code));
    // Only names no other country's big city shares: "Birmingham" would otherwise pull in the UK.
    const biggest = cities
      .filter((city) => city.country === code && city.population >= COUNTRY_CITY_MIN_POPULATION && uniqueTo(city))
      .sort((a, b) => b.population - a.population)
      .slice(0, COUNTRY_CITY_LIMIT);
    for (const city of biggest) add(city.name);
    for (const region of REGIONS[code] ?? []) add(region);
  }
  return out;
}

/** What a scan's location lists are built from: countries widened, then spellings widened. */
export function expandPlaces(terms) {
  return expandLocationTerms(expandCountryTerms(terms));
}
