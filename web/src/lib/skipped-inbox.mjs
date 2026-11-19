import { canonicalJobKey } from "./core/url-key.mjs";
import { readTrackerUrl } from "./posting-url.mjs";

const TOP = 6;

/**
 * Postings the user checked off in data/pipeline.md without a tracker row: the
 * inbox's Skip. A posting a tracker row covers was evaluated, not skipped, and
 * one listed twice counts once.
 *
 * @param {{ url: string, done: boolean, company?: string }[]} inbox
 * @param {{url?: string}[]} applications
 */
export function skippedInbox(inbox, applications) {
  const tracked = new Set(applications.map((app) => canonicalJobKey(readTrackerUrl(app.url))).filter(Boolean));
  const seen = new Set();
  const out = [];
  for (const job of inbox) {
    if (!job.done) continue;
    const key = canonicalJobKey(job.url) || job.url;
    if (tracked.has(key) || seen.has(key)) continue;
    seen.add(key);
    out.push(job);
  }
  return out;
}

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "unknown";
  }
}

function top(counts, total) {
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, TOP)
    .map(([label, count]) => ({ label, count, pct: total ? (count / total) * 100 : 0 }));
}

/**
 * What Analytics shows for the skipped postings: how many, what share of
 * everything reviewed (skipped + tracked), and where they came from. Kept apart
 * from the tracker so the funnel's "Tracked" count does not change.
 *
 * @param {{ url: string, done: boolean, company?: string }[]} inbox
 * @param {{url?: string}[]} applications
 */
export function skippedSummary(inbox, applications) {
  const skipped = skippedInbox(inbox, applications);
  const total = skipped.length;
  const reviewed = total + applications.length;
  const sources = new Map();
  const companies = new Map();
  for (const job of skipped) {
    const host = hostOf(job.url);
    sources.set(host, (sources.get(host) ?? 0) + 1);
    const company = (job.company ?? "").trim() || "Unknown";
    companies.set(company, (companies.get(company) ?? 0) + 1);
  }
  return {
    total,
    reviewed,
    share: reviewed ? (total / reviewed) * 100 : null,
    bySource: top(sources, total),
    byCompany: top(companies, total),
  };
}
