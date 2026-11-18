// Which scan a scheduled run produced. A run records when it finished and how long it took;
// a scan (data/scan-runs.tsv for filtered scans, scan-origin.tsv for a full sweep) records when
// it started or finished. The scan that belongs to the run is the newest one that falls inside
// the run's time span.

const SLACK_MS = 60_000;

/**
 * @param {{ id: string, startedAt: string }[]} scans  every scan, any order
 * @param {{ at?: string, durationMs?: number } | null | undefined} run  the scheduled run
 * @returns {string | null} the scan's id, or null when none falls inside the run
 */
export function scanForRun(scans, run) {
  const end = Date.parse(run?.at ?? "");
  if (!Number.isFinite(end)) return null;
  const span = Number.isFinite(Number(run?.durationMs)) ? Number(run.durationMs) : 0;
  const from = end - span - SLACK_MS;
  const to = end + SLACK_MS;
  let best = null;
  let bestAt = -Infinity;
  for (const scan of scans) {
    const at = Date.parse(scan.startedAt);
    if (!Number.isFinite(at) || at < from || at > to) continue;
    if (at > bestAt) {
      best = scan.id;
      bestAt = at;
    }
  }
  return best;
}

/** The job's newest finished run (success or failed), or null when it has none. */
export function lastFinishedRun(runs, jobId) {
  let best = null;
  for (const run of runs) {
    if (run.jobId !== jobId || (run.state !== "success" && run.state !== "failed")) continue;
    if (!best || Date.parse(run.at) > Date.parse(best.at)) best = run;
  }
  return best;
}
