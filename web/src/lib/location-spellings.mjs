// Browser- and script-safe: the spellings people use for the same place, and a helper
// that widens a typed place name to all of them. location-geo.mjs (server, reads a
// city dataset) shares the table; the scan filters use the helper so "Jogja" also
// catches a posting written "Yogyakarta".
import { normalizeLocation } from "./location-facet.mjs";

// Names people write that are not the dataset's spelling. Local-language names of
// big cities, plus short forms of regions. [spelling, canonical]
export const SPELLINGS = [
  ["jogja", "yogyakarta"], ["jogjakarta", "yogyakarta"], ["diy", "yogyakarta"],
  ["dki", "jakarta"], ["jabar", "west java"], ["jateng", "central java"], ["jatim", "east java"],
  ["warszawa", "warsaw"], ["lisboa", "lisbon"], ["koeln", "cologne"], ["muenchen", "munich"],
  ["wien", "vienna"], ["praha", "prague"], ["roma", "rome"], ["milano", "milan"], ["torino", "turin"],
  ["napoli", "naples"], ["firenze", "florence"], ["beograd", "belgrade"], ["bruxelles", "brussels"],
  ["kobenhavn", "copenhagen"], ["goteborg", "gothenburg"], ["sevilla", "seville"], ["zuerich", "zurich"],
  ["den haag", "the hague"], ["saigon", "ho chi minh city"], ["bombay", "mumbai"],
];

/**
 * The typed place names plus every other spelling of the same place, without
 * repeats. "Jogja" gives Jogja, yogyakarta, jogjakarta and diy. A name with no
 * known spelling is returned as typed.
 *
 * @param {string[]} terms
 * @returns {string[]}
 */
export function expandLocationTerms(terms) {
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
    for (const [spelling, canonical] of SPELLINGS) {
      if (key !== spelling && key !== canonical) continue;
      add(canonical);
      for (const [other, sameCanonical] of SPELLINGS) if (sameCanonical === canonical) add(other);
    }
  }
  return out;
}
