// The watcher's filter: the same title and location rules a scheduled scan uses, from the core scanner.
// It only sees a card (title, company, location), never the job text, so description-based checks
// (years of experience, salary) cannot apply here; they still run at evaluation.
import { FILTER_KEYS, hasFilters } from "./config.mjs";
import { locationKeys } from "../location-geo.mjs";

export { FILTER_KEYS, hasFilters };

const LOCATION_KEYS = ["allow", "block", "blockHard", "alwaysAllow"];

// LinkedIn cards often show only a city ("Springfield (On-site)"), which an `allow: Indonesia` list would
// reject; adding the country the city dataset knows keeps those cards matchable.
const locationText = (card) => `${card.location} ${locationKeys(card.location)}`.trim();

/** @returns {Promise<null | ((card: {title: string, location: string, link: string}) => boolean)>} null = keep everything */
export async function buildCardFilter(filters, loadCore) {
  if (!hasFilters(filters)) return null;
  if (typeof loadCore !== "function") throw new Error("core scanner is not available");
  const core = await loadCore();
  const titleOk = filters.positive.length > 0 || filters.negative.length > 0
    ? core.buildTitleFilter({ positive: filters.positive, negative: filters.negative })
    : null;
  const locationOk = LOCATION_KEYS.some((k) => filters[k].length > 0)
    ? core.buildLocationFilter({ allow: filters.allow, block: filters.block, block_hard: filters.blockHard, always_allow: filters.alwaysAllow })
    : null;
  return (card) => {
    if (titleOk && !titleOk(card.title)) return false;
    if (locationOk && !locationOk(locationText(card), card.link, card.title)) return false;
    return true;
  };
}
