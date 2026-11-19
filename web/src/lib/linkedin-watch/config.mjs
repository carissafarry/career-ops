// LinkedIn watcher config: validation, jittered delay, active hours, daily quota.
// All timing decisions live here (the Chrome extension only obeys the reply).
export class WatchConfigError extends Error {}

const MIN_INTERVAL = 5;
const MAX_PAGES_PER_POLL = 5;
const MAX_DEEP_PAGES = 10;
export const FILTER_KEYS = ["positive", "negative", "allow", "block", "blockHard", "alwaysAllow"];
const MAX_FILTER_ENTRIES = 300;

// Same shape as a scheduled scan's `filters` (title positive/negative, location allow/block/blockHard/alwaysAllow).
function parseFilters(raw) {
  if (raw === undefined || raw === null) raw = {};
  if (typeof raw !== "object" || Array.isArray(raw)) throw new WatchConfigError("filters must be an object");
  const out = {};
  for (const key of FILTER_KEYS) {
    const list = raw[key] ?? [];
    if (!Array.isArray(list) || list.some((v) => typeof v !== "string")) throw new WatchConfigError(`filters.${key} must be a list of text entries`);
    const clean = [...new Set(list.map((v) => v.trim()).filter(Boolean))];
    if (clean.length > MAX_FILTER_ENTRIES) throw new WatchConfigError(`filters.${key} has more than ${MAX_FILTER_ENTRIES} entries`);
    out[key] = clean;
  }
  return out;
}

export const hasFilters = (filters) => Boolean(filters) && FILTER_KEYS.some((k) => (filters[k] ?? []).length > 0);

function parseHours(value) {
  const m = /^(\d{2}):(\d{2})-(\d{2}):(\d{2})$/.exec(String(value).trim());
  if (!m) throw new WatchConfigError('active_hours must look like "08:00-23:00"');
  const [h1, m1, h2, m2] = m.slice(1).map(Number);
  if (h1 > 23 || h2 > 23 || m1 > 59 || m2 > 59) throw new WatchConfigError("active_hours has an invalid time");
  return { startMin: h1 * 60 + m1, endMin: h2 * 60 + m2 };
}

export function parseWatchConfig(raw) {
  if (!raw || typeof raw !== "object") throw new WatchConfigError("config must be an object");
  let url;
  try {
    url = new URL(String(raw.search_url ?? ""));
  } catch {
    throw new WatchConfigError("search_url must be a LinkedIn jobs search URL");
  }
  if (url.protocol !== "https:" || url.hostname !== "www.linkedin.com" || !url.pathname.startsWith("/jobs/search")) {
    throw new WatchConfigError("search_url must be https://www.linkedin.com/jobs/search/...");
  }
  const intervalMinutes = raw.interval_minutes ?? 10;
  if (typeof intervalMinutes !== "number" || !(intervalMinutes >= MIN_INTERVAL)) {
    throw new WatchConfigError(`interval_minutes must be at least ${MIN_INTERVAL}`);
  }
  const jitterPercent = raw.jitter_percent ?? 30;
  if (typeof jitterPercent !== "number" || jitterPercent < 0 || jitterPercent > 90) {
    throw new WatchConfigError("jitter_percent must be between 0 and 90");
  }
  const maxPollsPerDay = raw.max_polls_per_day ?? 150;
  if (!Number.isInteger(maxPollsPerDay) || maxPollsPerDay < 1) {
    throw new WatchConfigError("max_polls_per_day must be a whole number of at least 1");
  }
  const pagesPerPoll = raw.pages_per_poll ?? 1;
  if (!Number.isInteger(pagesPerPoll) || pagesPerPoll < 1 || pagesPerPoll > MAX_PAGES_PER_POLL) {
    throw new WatchConfigError(`pages_per_poll must be a whole number from 1 to ${MAX_PAGES_PER_POLL}`);
  }
  const deepPages = raw.deep_pages ?? 5;
  if (!Number.isInteger(deepPages) || deepPages < 1 || deepPages > MAX_DEEP_PAGES) {
    throw new WatchConfigError(`deep_pages must be a whole number from 1 to ${MAX_DEEP_PAGES}`);
  }
  const activeHours = raw.active_hours ? parseHours(raw.active_hours) : null;
  return { searchUrl: url.toString(), intervalMinutes, jitterPercent, maxPollsPerDay, activeHours, pagesPerPoll, deepPages, filters: parseFilters(raw.filters) };
}

export function nextDelayMs(cfg, random) {
  const base = cfg.intervalMinutes * 60_000;
  const spread = (base * cfg.jitterPercent) / 100;
  return Math.round(base - spread + 2 * spread * random());
}

export function withinActiveHours(cfg, now) {
  if (!cfg.activeHours) return true;
  const m = now.getHours() * 60 + now.getMinutes();
  const { startMin, endMin } = cfg.activeHours;
  return startMin <= endMin ? m >= startMin && m < endMin : m >= startMin || m < endMin;
}

export function pollsAllowed(cfg, pollTimesIso, now) {
  const today = now.toDateString();
  const count = pollTimesIso.filter((t) => new Date(t).toDateString() === today).length;
  return count < cfg.maxPollsPerDay;
}
