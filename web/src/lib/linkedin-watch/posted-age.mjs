// LinkedIn writes how old a posting is relative to the moment the card was read ("14 hours ago").
// Subtracting that from the time the watcher read it gives an estimate of when LinkedIn says it was posted,
// which is what the list sorts by. It is an estimate: LinkedIn rounds ("1 day ago" covers a day or more).
const UNIT_MS = { minute: 60_000, min: 60_000, menit: 60_000, hour: 3_600_000, hr: 3_600_000, jam: 3_600_000, day: 86_400_000, hari: 86_400_000, week: 604_800_000, minggu: 604_800_000, month: 2_592_000_000, bulan: 2_592_000_000, year: 31_536_000_000, tahun: 31_536_000_000 };
const AGE = /(\d+)\s*(minute|min|menit|hour|hr|jam|day|hari|week|minggu|month|bulan|year|tahun)s?\b/i;
const NOW = /\b(just now|moments? ago|baru saja)\b/i;

/** When LinkedIn says this was posted (epoch ms), from its relative text and the time it was read; null if the text says nothing. */
export function postedAtMs(postedText, readAtIso) {
  const readAt = Date.parse(readAtIso);
  if (!Number.isFinite(readAt)) return null;
  const text = String(postedText ?? "");
  const m = AGE.exec(text);
  if (m) return readAt - Number(m[1]) * UNIT_MS[m[2].toLowerCase()];
  return NOW.test(text) ? readAt : null;
}

const when = (p) => postedAtMs(p.postedText, p.firstSeen) ?? Date.parse(p.firstSeen) ?? 0;

/** Array.sort comparator: newest posted on LinkedIn first. A posting with no usable text counts as posted when it was first seen. */
export const byPostedNewest = (a, b) => (when(b) || 0) - (when(a) || 0);

const plural = (n, unit) => `${n} ${unit}${n === 1 ? "" : "s"} ago`;

/** An age in milliseconds the way LinkedIn writes it: "3 hours ago", "2 weeks ago". Never negative. */
export function formatAgeMs(ms) {
  const min = Math.max(0, Math.floor(ms / 60_000));
  if (min < 1) return "just now";
  if (min < 60) return plural(min, "minute");
  const hours = Math.floor(min / 60);
  if (hours < 24) return plural(hours, "hour");
  const days = Math.floor(hours / 24);
  if (days < 7) return plural(days, "day");
  if (days < 30) return plural(Math.floor(days / 7), "week");
  if (days < 365) return plural(Math.floor(days / 30), "month");
  return plural(Math.floor(days / 365), "year");
}

/** How old the posting is right now, counted from the age LinkedIn showed when it was read; null if that text said nothing. */
export function postedAgeNow(posting, nowMs) {
  const at = postedAtMs(posting.postedText, posting.firstSeen);
  return at === null ? null : formatAgeMs(nowMs - at);
}

/** The compact form the Pipeline rows use: "just now", "40m ago", "5h ago". Callers use days for anything a day or older. */
export function shortAgo(ms) {
  const min = Math.max(0, Math.floor(ms / 60_000));
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  return `${Math.floor(min / 60)}h ago`;
}
