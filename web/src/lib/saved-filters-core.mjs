// The pure half of saved Explore filters (no React, no storage), kept apart so the
// test suite can load it without a TypeScript runner for the hook.
import { DEFAULT_FILTERS, filtersToParams, paramsToFilters } from "./explore.ts";

const MAX_NAME = 40;

/** A saved set's name as stored: single spaces, trimmed, at most 40 characters. */
export function cleanName(input) {
  return String(input).replace(/\s+/g, " ").trim().slice(0, MAX_NAME);
}

/** The filters a saved entry (`{ query }`) restores. */
export function filtersOf(saved) {
  return paramsToFilters(new URLSearchParams(saved.query), DEFAULT_FILTERS);
}

/** Does this saved entry hold exactly the given filters? */
export function sameFilters(saved, filters) {
  return filtersToParams(filtersOf(saved)) === filtersToParams(filters);
}
