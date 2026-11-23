import { statusToken } from "./pipeline-sankey.mjs";

// What happened to the applications an employer opened (status Viewed).
//
// The cohort is every tracker row that is Viewed now, or that the status log
// shows passing through Viewed. Each row is then read by where it stands today:
//   advanced: Responded, Assessment, Interview, Offer or Hired
//   waiting:  still Viewed
//   stopped:  Rejected or Discarded
// A row in any other state (an Applied row moved back, say) is left out rather
// than guessed at. SKIP rows are never part of the pipeline.

const ADVANCED = ["RESPONDED", "ASSESSMENT", "INTERVIEW", "OFFER", "HIRED"];
const STOPPED = ["REJECTED", "DISCARDED"];

const isViewed = (value) => statusToken(value) === "VIEWED";

/**
 * @param {{ n: string, status: string }[]} applications
 * @param {{ num: number, from: string, to: string }[]} statusLog
 */
export function viewedOutcomes(applications, statusLog) {
  const ever = new Set();
  for (const row of Array.isArray(statusLog) ? statusLog : []) {
    if (isViewed(row?.from) || isViewed(row?.to)) ever.add(Number(row.num));
  }

  const byStage = Object.fromEntries(ADVANCED.map((s) => [s, 0]));
  let waiting = 0;
  let stopped = 0;
  let advanced = 0;
  for (const app of Array.isArray(applications) ? applications : []) {
    const status = statusToken(app?.status);
    const num = /^\d+$/.test(String(app?.n)) ? Number(app.n) : null;
    if (status !== "VIEWED" && !(num !== null && ever.has(num))) continue;
    if (status === "VIEWED") waiting += 1;
    else if (ADVANCED.includes(status)) {
      advanced += 1;
      byStage[status] += 1;
    } else if (STOPPED.includes(status)) stopped += 1;
  }

  const total = advanced + waiting + stopped;
  const resolved = advanced + stopped;
  return {
    total,
    advanced,
    waiting,
    stopped,
    byStage,
    // Share of the ones with an answer. null, not 0, while nothing has been decided: no answer yet is not "none moved on".
    advancedOfResolved: resolved > 0 ? Math.round((advanced / resolved) * 100) : null,
  };
}
