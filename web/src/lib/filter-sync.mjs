/**
 * Moving saved filters between browsers (a laptop and a phone).
 *
 * The filters live in each browser's localStorage, so a second device starts empty.
 * "Send" copies them to one small file on the server, "Get" copies that file back
 * into the browser that asks. Only the keys named here travel, never anything else
 * a browser stores.
 */
export const FILTER_SYNC_KEYS = Object.freeze([
  "career-ops:pipeline-views",
  "career-ops:inbox-filters",
  "career-ops:inbox-sort",
]);

const MAX_VALUE_CHARS = 100_000;

/**
 * Keep the known keys whose value is a string of sane size.
 * @param {unknown} items
 * @returns {Record<string, string>}
 */
export function cleanItems(items) {
  /** @type {Record<string, string>} */
  const out = {};
  if (!items || typeof items !== "object") return out;
  for (const key of FILTER_SYNC_KEYS) {
    const value = /** @type {Record<string, unknown>} */ (items)[key];
    if (typeof value === "string" && value.length <= MAX_VALUE_CHARS) out[key] = value;
  }
  return out;
}

/**
 * @param {Pick<Storage, "getItem">} storage
 * @returns {Record<string, string>}
 */
export function readItems(storage) {
  /** @type {Record<string, string>} */
  const out = {};
  for (const key of FILTER_SYNC_KEYS) {
    const value = storage.getItem(key);
    if (value != null) out[key] = value;
  }
  return cleanItems(out);
}

/**
 * Replace this browser's filters with the received ones. A key the sender never
 * set is cleared here too, so the two devices end up the same.
 * @param {Pick<Storage, "setItem" | "removeItem">} storage
 * @param {unknown} items
 */
export function writeItems(storage, items) {
  const clean = cleanItems(items);
  for (const key of FILTER_SYNC_KEYS) {
    if (key in clean) storage.setItem(key, clean[key]);
    else storage.removeItem(key);
  }
  return Object.keys(clean).length;
}
