// The country buttons next to every location filter. One click puts the country in
// the include list, a second moves it to the exclude list, a third clears it.
import { normalizeLocation, NO_COUNTRY } from "./location-facet.mjs";

export { NO_COUNTRY };

export const COUNTRY_TEMPLATES = [
  "Indonesia",
  "Singapore",
  "Malaysia",
  "Philippines",
  "Vietnam",
  "Thailand",
  "India",
  "Australia",
  "United States",
  "United Kingdom",
  "Germany",
  "Netherlands",
  "Canada",
];

const has = (list, country) => list.some((item) => normalizeLocation(item) === normalizeLocation(country));
const without = (list, country) => list.filter((item) => normalizeLocation(item) !== normalizeLocation(country));

/** "include", "exclude" or "none" for one country, given the two lists. */
export function countryState(include, exclude, country) {
  if (has(include, country)) return "include";
  if (has(exclude, country)) return "exclude";
  return "none";
}

/** The two lists after one click on a country: none -> include -> exclude -> none. */
export function cycleCountry(include, exclude, country) {
  const state = countryState(include, exclude, country);
  if (state === "none") return { include: [...include, country], exclude };
  if (state === "include") return { include: without(include, country), exclude: [...exclude, country] };
  return { include, exclude: without(exclude, country) };
}

/** A comma-separated filter box as a list, and back. */
export const listOf = (text) => String(text ?? "").split(",").map((part) => part.trim()).filter(Boolean);
export const textOf = (list) => list.join(", ");

// The Region row: one button fills the include list with every member country.
// ASEAN is the ten member states; APAC is ASEAN plus the rest of Asia-Pacific.
const ASEAN = ["Indonesia", "Singapore", "Malaysia", "Philippines", "Vietnam", "Thailand", "Brunei", "Cambodia", "Laos", "Myanmar"];
const EU = ["Austria", "Belgium", "Bulgaria", "Croatia", "Cyprus", "Czechia", "Denmark", "Estonia", "Finland", "France", "Germany", "Greece", "Hungary", "Ireland", "Italy", "Latvia", "Lithuania", "Luxembourg", "Malta", "Netherlands", "Poland", "Portugal", "Romania", "Slovakia", "Slovenia", "Spain", "Sweden"];
export const REGIONS = {
  ASEAN,
  APAC: [...ASEAN, "India", "Australia", "New Zealand", "Japan", "South Korea", "China", "Hong Kong", "Taiwan"],
  EU,
  Europe: [...EU, "United Kingdom", "Switzerland", "Norway", "Iceland", "Ukraine", "Serbia"],
  "Middle East": ["United Arab Emirates", "Saudi Arabia", "Qatar", "Kuwait", "Bahrain", "Oman", "Israel", "Jordan", "Egypt", "Türkiye"],
  "North America": ["United States", "Canada", "Mexico"],
  "Latin America": ["Brazil", "Argentina", "Chile", "Colombia", "Peru", "Uruguay", "Costa Rica"],
  "South Asia": ["India", "Pakistan", "Bangladesh", "Sri Lanka", "Nepal"],
};

/** "include" when every member is in the include list, "partial" when some are, else "none". */
export function regionState(include, region) {
  const members = REGIONS[region];
  const n = members.filter((country) => has(include, country)).length;
  return n === members.length ? "include" : n > 0 ? "partial" : "none";
}

/** The two lists after one click on a region: complete it, or remove it when already complete. */
export function toggleRegion(include, exclude, region) {
  const members = REGIONS[region];
  if (regionState(include, region) === "include") {
    return { include: include.filter((item) => !has(members, item)), exclude };
  }
  const missing = members.filter((country) => !has(include, country));
  return { include: [...include, ...missing], exclude: exclude.filter((item) => !has(members, item)) };
}

/** The include list after one click on the "No country listed" button. */
/** The word a posting's location carries when it is remote ("Remote (worldwide)", "Remote, US"). */
export const REMOTE = "Remote";

/** Add or remove Remote in the include list; adding it also clears it from the exclude list. */
export function toggleRemote(include, exclude) {
  if (has(include, REMOTE)) return { include: without(include, REMOTE), exclude };
  return { include: [...include, REMOTE], exclude: without(exclude, REMOTE) };
}

export function toggleNoCountry(include) {
  return has(include, NO_COUNTRY) ? without(include, NO_COUNTRY) : [...include, NO_COUNTRY];
}
