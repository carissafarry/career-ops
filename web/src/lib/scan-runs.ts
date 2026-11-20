import fs from "node:fs";
import path from "node:path";
import { careerOpsRoot } from "@/lib/career-ops";
import { buildScanRuns, scanIdByUrl } from "@/lib/scan-runs-core.mjs";
import { readSearches } from "@/lib/linkedin-watch/searches.mjs";
import { watchPaths } from "@/lib/linkedin-watch/store.mjs";

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
  /** LinkedIn watcher polls only: the saved search this poll read. `search` is its key (empty on polls logged before it was recorded); `searchName` is filled in when that search is still saved. */
  search?: string;
  searchName?: string;
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
  const names = new Map<string, string>(readSearches(watchPaths(careerOpsRoot())).map((s: { id: string; name: string }) => [s.id, s.name]));
  const runs = buildScanRuns({
    runsTsv: readData("data/scan-runs.tsv"),
    historyTsv: readData("data/scan-history.tsv"),
    originTsv: readData("data/scan-origin.tsv"),
    postingsTsv: readData("data/scan-run-postings.tsv"),
    linkedinPollsTsv: readData("data/linkedin-watch-polls.tsv"),
  }) as ScanRun[];
  // A poll names the search it read by key; the name is whatever that search is saved as now.
  return runs.map((run) => (run.search ? { ...run, searchName: names.get(run.search) ?? "Unsaved search" } : run));
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
