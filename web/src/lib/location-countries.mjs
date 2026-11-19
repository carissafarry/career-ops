// The country buttons next to every location filter. One click puts the country in
// the include list, a second moves it to the exclude list, a third clears it.
import { normalizeLocation } from "./location-facet.mjs";

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
