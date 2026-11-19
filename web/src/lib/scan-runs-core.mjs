// Scan history: which scan found which posting.
//
// scan.mjs logs one row per run in data/scan-runs.tsv, and appends every posting
// it adds to data/scan-history.tsv in the order it found them. The history rows
// carry no run id, so a run's postings are recovered from the order: the last
// sum(new_added) `added` rows, split into consecutive blocks, one per run.
//
// scan-ats-full.mjs writes no run row. Its URLs are listed in
// data/scan-origin.tsv (url, scan id, started_at) and are kept out of that
// ordering, then grouped into one "full" run per scan id.

const splitLines = (text) => String(text ?? "").split(/\r?\n/).filter((line) => line.length > 0);
const toRows = (text) => splitLines(text).map((line) => line.split("\t"));

/** @typedef {{url: string, company: string, role: string, location: string, firstSeen: string, postedAt?: string}} ScanPosting */
/** @typedef {{id: string, kind: "filtered" | "full", startedAt: string, found: number, added: number, filteredTitle: number, dupes: number, kept?: number, postings: ScanPosting[]}} ScanRun */

function columnIndex(header) {
  const index = new Map();
  header.forEach((name, i) => index.set(name.trim(), i));
  return index;
}

function historyPosting(cols) {
  return {
    url: cols[0] ?? "",
    firstSeen: cols[1] ?? "",
    role: cols[3] ?? "",
    company: cols[4] ?? "",
    location: cols[6] ?? "",
    postedAt: /^\d{4}-\d{2}-\d{2}/.test(cols[8] ?? "") ? cols[8].slice(0, 10) : "",
  };
}

/**
 * @param {{runsTsv?: string, historyTsv?: string, originTsv?: string, postingsTsv?: string, linkedinPollsTsv?: string}} input
 * @returns {ScanRun[]} newest first
 */
export function buildScanRuns({ runsTsv = "", historyTsv = "", originTsv = "", postingsTsv = "", linkedinPollsTsv = "" }) {
  const originRows = toRows(originTsv).filter((cols, i) => !(i === 0 && cols[0] === "url"));
  const fullUrls = new Set(originRows.map((cols) => cols[0]));

  // data/scan-run-postings.tsv pins a run's postings (url, run id), so a row's
  // status can change later (a posting aged out of the filter) without moving
  // it out of the scan that found it. Runs it covers skip the ordering below.
  const pinned = new Map();
  const pinnedUrls = new Set();
  for (const cols of toRows(postingsTsv)) {
    const [url, runId] = cols;
    if (!url || !runId || url === "url") continue;
    if (!pinned.has(runId)) pinned.set(runId, []);
    pinned.get(runId).push(url);
    pinnedUrls.add(url);
  }

  const detailsByUrl = new Map();
  const added = [];
  for (const cols of toRows(historyTsv)) {
    if (cols[0] && !detailsByUrl.has(cols[0])) detailsByUrl.set(cols[0], historyPosting(cols));
    if (cols[5] !== "added" || fullUrls.has(cols[0]) || pinnedUrls.has(cols[0])) continue;
    added.push(historyPosting(cols));
  }

  const runRows = toRows(runsTsv);
  const index = runRows.length ? columnIndex(runRows[0]) : new Map();
  const num = (cols, name) => {
    const at = index.get(name);
    const value = at == null ? 0 : Number.parseInt(cols[at] ?? "", 10);
    return Number.isFinite(value) ? value : 0;
  };

  const filtered = [];
  for (const cols of runRows.slice(1)) {
    const at = index.get("timestamp");
    const startedAt = at == null ? "" : cols[at] ?? "";
    if (!startedAt) continue;
    filtered.push({
      id: startedAt,
      kind: "filtered",
      startedAt,
      found: num(cols, "found"),
      added: num(cols, "new_added"),
      filteredTitle: num(cols, "filtered_title"),
      dupes: num(cols, "dupes"),
      postings: [],
    });
  }

  // Runs with a pinned posting list use it. The others split the remaining
  // `added` rows by order: the newest rows belong to the newest runs, so count
  // back from the end.
  const unpinned = filtered.filter((run) => !pinned.has(run.id));
  for (const run of filtered) {
    const urls = pinned.get(run.id);
    if (urls) run.postings = urls.map((url) => detailsByUrl.get(url) ?? { url, company: "", role: "", location: "", firstSeen: "" });
  }
  const total = unpinned.reduce((sum, run) => sum + run.added, 0);
  let cursor = Math.max(0, added.length - total);
  for (const run of unpinned) {
    run.postings = added.slice(cursor, cursor + run.added);
    cursor += run.added;
  }

  // A full-scan row may carry its own details (company, role, location, posted date),
  // for a scan whose roles were never written to the history. Without them, the
  // details come from the history row of the same URL.
  const fullById = new Map();
  for (const cols of originRows) {
    const [url, scanId, startedAt = "", company = "", role = "", location = "", postedAt = ""] = cols;
    if (!url || !scanId) continue;
    let run = fullById.get(scanId);
    if (!run) {
      run = { id: scanId, kind: "full", startedAt, found: 0, added: 0, filteredTitle: 0, dupes: 0, postings: [] };
      fullById.set(scanId, run);
    }
    run.postings.push({ url, company, role, location, firstSeen: "", postedAt: /^\d{4}-\d{2}-\d{2}$/.test(postedAt) ? postedAt : "" });
    run.added = run.postings.length;
  }
  if (fullById.size) {
    const byUrl = new Map();
    for (const cols of toRows(historyTsv)) if (cols[5] === "added" && fullUrls.has(cols[0]) && !byUrl.has(cols[0])) byUrl.set(cols[0], historyPosting(cols));
    for (const run of fullById.values()) {
      run.postings = run.postings.map((p) => (p.company || p.role ? p : byUrl.get(p.url) ?? p));
    }
  }

  // The LinkedIn watcher logs every poll in data/linkedin-watch-polls.tsv (read, kept by the filters, listed).
  // A poll that listed roles already has a run from scan-origin.tsv (same id); one that found nothing gets an empty run.
  for (const cols of toRows(linkedinPollsTsv)) {
    const [startedAt, read, kept, added] = cols;
    if (!startedAt || startedAt === "started_at") continue;
    const id = `linkedin-${startedAt}`;
    const counts = { found: Number.parseInt(read, 10) || 0, kept: Number.parseInt(kept, 10) || 0 };
    const existing = fullById.get(id);
    if (existing) Object.assign(existing, counts);
    else fullById.set(id, { id, kind: "full", startedAt, filteredTitle: 0, dupes: 0, added: Number.parseInt(added, 10) || 0, postings: [], ...counts });
  }

  return [...filtered, ...fullById.values()].sort((a, b) => (a.startedAt < b.startedAt ? 1 : a.startedAt > b.startedAt ? -1 : 0));
}

/** "Scan 17 Nov, 14:37" or "Full scan 17 Nov, 22:07". */
export function scanLabel(run) {
  const d = new Date(run.startedAt);
  const when = Number.isNaN(d.getTime())
    ? run.startedAt
    : d.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });
  const name = String(run.id).startsWith("linkedin-") ? "LinkedIn watch" : run.kind === "full" ? "Full scan" : "Scan";
  return `${name} ${when}`;
}

/** url -> run id, for the pipeline's "which scan" selector. */
export function scanIdByUrl(runs) {
  const map = {};
  for (const run of runs) for (const posting of run.postings) map[posting.url] = run.id;
  return map;
}
