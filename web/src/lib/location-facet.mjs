// The inbox's location box. A posting's location is free text ("Sleman,
// Yogyakarta Special Region") and often omits the country, so typing "Indonesia"
// used to miss it. location-geo.mjs (server only, it reads a city dataset) works
// out the countries and spellings a location implies and writes them into one
// lowercase string, `locationKeys`. This file is the light, browser-safe half: it
// normalizes text and matches a typed query against those keys.

/** Lowercase, strip accents, and keep letters and digits as space-separated words. */
export function normalizeLocation(text) {
  return String(text ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ł/gi, "l")
    .replace(/đ/gi, "d")
    .replace(/ø/gi, "o")
    .replace(/ß/g, "ss")
    .replace(/æ/gi, "ae")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * True when `query` starts a word in the keys, so "indo" finds Indonesia and
 * "jakarta" does not find "Jogjakarta". The keys and the query are both
 * normalized (accents and punctuation removed) before they are compared.
 */
export function locationMatches(keys, query) {
  const q = normalizeLocation(query);
  if (!q) return true;
  return ` ${normalizeLocation(keys)}`.includes(` ${q}`);
}

/**
 * True when any place in the comma-separated `query` starts a word in the keys.
 * Used by the "Exclude location" box: "Jogja, Bali" hides postings in either.
 * An empty query excludes nothing.
 */
export function locationExcluded(keys, query) {
  return String(query ?? "")
    .split(",")
    .some((part) => normalizeLocation(part) !== "" && locationMatches(keys, part));
}

/**
 * True when the text matches any place in the comma-separated `query`; an empty
 * query matches everything. The include box takes "Indonesia, Singapore" this way.
 */
export function locationMatchesAny(keys, query) {
  const parts = String(query ?? "").split(",").filter((part) => normalizeLocation(part) !== "");
  return parts.length === 0 || parts.some((part) => locationMatches(keys, part));
}
