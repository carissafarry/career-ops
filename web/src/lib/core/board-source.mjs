// Isolated, read-only worker for one job board: import the provider and the
// scanner's filter functions, never run scan.main(), write nothing.
import path from "node:path";
import { pathToFileURL } from "node:url";
import { BOARD_ENTRIES } from "../board-sources.mjs";

export const MAX_TERMS = 6;
const DAY_MS = 86_400_000;

/** The jobs a provider returned, whichever shape it uses (array, or { jobs }). */
function jobsOf(result) {
  if (Array.isArray(result)) return result;
  return Array.isArray(result?.jobs) ? result.jobs : [];
}

/**
 * Read one board for every search term and keep what the title and location
 * filters accept. `request` carries the filters as the scanner reads them
 * ({ titleFilter, locationFilter }), so Explore and the scan agree on what matches.
 */
export async function scanBoard(id, request, { provider, core, http, now = Date.now() }) {
  const entry = BOARD_ENTRIES[id];
  const titleMatches = core.buildTitleFilter(request.titleFilter ?? {});
  const locationMatches = core.buildLocationFilter(request.locationFilter ?? {});
  // data/blacklist.md, the same do-not-apply list the scanner reads (absent = no filtering).
  const blacklist = core.loadBlacklist?.() ?? new Map();
  const sinceDays = Math.max(1, Number(request.sinceDays) || 7);
  const terms = entry.search ? [...new Set((request.terms ?? []).filter((t) => typeof t === "string" && t.trim()))].slice(0, MAX_TERMS) : [];
  // A board that takes a search phrase gets one query per term (none = the whole board).
  const queries = entry.search ? (terms.length ? terms : [""]) : [""];

  const ctx = { ...http };
  const offers = [];
  const seen = new Set();
  let incomplete = "";
  let failures = 0;
  let lastError = "";
  let invalid = 0;

  for (const term of queries) {
    let jobs;
    try {
      const { name, provider: providerId, search, maxPages, ...rest } = entry;
      jobs = jobsOf(
        await provider.fetch(
          {
            name,
            provider: providerId,
            ...rest,
            ...(maxPages ? { max_pages: maxPages } : {}),
            ...(search ? { searchKeywords: term } : {}),
            dateRange: sinceDays,
          },
          ctx,
        ),
      );
    } catch (error) {
      failures++;
      lastError = error instanceof Error ? error.message : String(error);
      continue;
    }
    for (const job of jobs) {
      if (!job || typeof job.url !== "string" || typeof job.title !== "string" || !job.title.trim()) {
        invalid++;
        continue;
      }
      let url;
      try {
        url = new URL(job.url);
      } catch {
        invalid++;
        continue;
      }
      if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) {
        invalid++;
        continue;
      }
      const company = typeof job.company === "string" && job.company.trim() ? job.company.trim() : entry.name;
      if (core.findBlacklistEntry?.(blacklist, company, job.url)) continue;
      if (!titleMatches(job.title)) continue;
      if (!locationMatches(job.location, job.url, job.title)) continue;
      const posted = job.postedAt == null ? null : new Date(job.postedAt);
      const postedOk = posted && Number.isFinite(posted.getTime());
      if (postedOk && now - posted.getTime() > sinceDays * DAY_MS) continue;
      const key = core.normalizeUrlForDedup(job.url);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      offers.push({
        company,
        title: job.title.trim(),
        url: job.url,
        location: job.location || "",
        postedAt: postedOk ? posted.toISOString().slice(0, 10) : "",
        ats: id,
        source: id,
      });
    }
  }

  if (failures === queries.length) {
    return { id, state: "failed", reason: describeFailure(lastError), offers: [] };
  }
  if (failures) incomplete = `${failures} of ${queries.length} searches failed`;
  else if (invalid) incomplete = `${invalid} records were unreadable`;
  return { id, state: incomplete ? "incomplete" : "complete", reason: incomplete, offers };
}

/** A short reason without the HTML page some sites answer with. */
export function describeFailure(message) {
  const text = String(message || "");
  const status = text.match(/\bHTTP (\d{3})\b/);
  if (status && (status[1] === "403" || status[1] === "429")) return `HTTP ${status[1]}: the site is blocking automated requests`;
  if (status) return `HTTP ${status[1]}`;
  const plain = text.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  return plain.slice(0, 120) || "the board could not be read";
}

// The Web route spawns this worker by absolute filename.
if (process.argv[2] === "--worker") {
  const [codeRoot, id] = process.argv.slice(3);
  try {
    if (!Object.hasOwn(BOARD_ENTRIES, id)) throw new Error("Unknown board");
    let input = "";
    for await (const chunk of process.stdin) input += chunk;
    const load = (relative) => import(pathToFileURL(path.join(codeRoot, relative)).href);
    const [{ default: provider }, core, http] = await Promise.all([
      load(`providers/${BOARD_ENTRIES[id].provider}.mjs`),
      load("scan.mjs"),
      load("providers/_http.mjs"),
    ]);
    const result = await scanBoard(id, JSON.parse(input), { provider, core, http: http.makeHttpCtx() });
    process.stdout.write(JSON.stringify(result));
  } catch (error) {
    process.stdout.write(
      JSON.stringify({ id, state: "failed", reason: describeFailure(error instanceof Error ? error.message : ""), offers: [] }),
    );
    process.exitCode = 1;
  }
}
