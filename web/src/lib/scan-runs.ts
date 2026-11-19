import fs from "node:fs";
import path from "node:path";
import { careerOpsRoot } from "@/lib/career-ops";
import { buildScanRuns, scanIdByUrl } from "@/lib/scan-runs-core.mjs";

export type ScanPosting = { url: string; company: string; role: string; location: string; firstSeen: string; postedAt?: string };
export type ScanRun = {
  id: string;
  kind: "filtered" | "full";
  startedAt: string;
  found: number;
  added: number;
  filteredTitle: number;
  dupes: number;
  /** LinkedIn watcher polls only: how many of the `found` jobs matched the user's filters. */
  kept?: number;
  postings: ScanPosting[];
};
/** What the pipeline's scan selector needs: no postings, just the label data. */
export type ScanRunSummary = Pick<ScanRun, "id" | "kind" | "startedAt" | "added"> & {
  /** How many of this scan's roles are in the pipeline inbox right now. */
  inInbox: number;
};

function readData(rel: string): string {
  try {
    return fs.readFileSync(path.join(careerOpsRoot(), rel), "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return "";
    throw err;
  }
}

/** Every scan run, newest first. Missing files read as empty. */
export function readScanRuns(): ScanRun[] {
  return buildScanRuns({
    runsTsv: readData("data/scan-runs.tsv"),
    historyTsv: readData("data/scan-history.tsv"),
    originTsv: readData("data/scan-origin.tsv"),
    postingsTsv: readData("data/scan-run-postings.tsv"),
    linkedinPollsTsv: readData("data/linkedin-watch-polls.tsv"),
  }) as ScanRun[];
}

export function scanSelectorData(
  runs: ScanRun[],
  inboxUrls: Iterable<string> = [],
): { summaries: ScanRunSummary[]; byUrl: Record<string, string> } {
  const inbox = new Set(inboxUrls);
  return {
    summaries: runs.map(({ id, kind, startedAt, added, postings }) => ({
      id,
      kind,
      startedAt,
      added,
      inInbox: postings.reduce((count, p) => count + (inbox.has(p.url) ? 1 : 0), 0),
    })),
    byUrl: scanIdByUrl(runs) as Record<string, string>,
  };
}

export { scanLabel } from "@/lib/scan-runs-core.mjs";
