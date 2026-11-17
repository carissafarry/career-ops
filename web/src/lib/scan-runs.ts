import fs from "node:fs";
import path from "node:path";
import { careerOpsRoot } from "@/lib/career-ops";
import { buildScanRuns, scanIdByUrl } from "@/lib/scan-runs-core.mjs";

export type ScanPosting = { url: string; company: string; role: string; location: string; firstSeen: string };
export type ScanRun = {
  id: string;
  kind: "filtered" | "full";
  startedAt: string;
  found: number;
  added: number;
  filteredTitle: number;
  dupes: number;
  postings: ScanPosting[];
};
/** What the pipeline's scan selector needs: no postings, just the label data. */
export type ScanRunSummary = Pick<ScanRun, "id" | "kind" | "startedAt" | "added">;

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
  }) as ScanRun[];
}

export function scanSelectorData(runs: ScanRun[]): { summaries: ScanRunSummary[]; byUrl: Record<string, string> } {
  return {
    summaries: runs.map(({ id, kind, startedAt, added }) => ({ id, kind, startedAt, added })),
    byUrl: scanIdByUrl(runs) as Record<string, string>,
  };
}

export { scanLabel } from "@/lib/scan-runs-core.mjs";
