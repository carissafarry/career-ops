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
