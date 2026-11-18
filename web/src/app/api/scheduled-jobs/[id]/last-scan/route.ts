import { NextResponse } from "next/server";
import { listScheduledJobs } from "@/lib/scheduled-jobs";
import { isSafeScheduledId } from "@/lib/scheduled-jobs-store.mjs";
import { readScanRuns } from "@/lib/scan-runs";
import { lastFinishedRun, scanForRun } from "@/lib/scan-for-run.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The scan page (/scans?run=<id>) for a scheduled job's most recent finished run. `scanId`
// is null when the run left no scan record (it found nothing to write, or it failed first).
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isSafeScheduledId(id)) return NextResponse.json({ error: "Invalid scheduled job identifier." }, { status: 400 });
  try {
    const run = lastFinishedRun(listScheduledJobs().runs, id);
    if (!run) return NextResponse.json({ scanId: null, at: null });
    const scanId = scanForRun(readScanRuns(), run);
    return NextResponse.json({ scanId, at: run.at, state: run.state });
  } catch {
    return NextResponse.json({ error: "Could not read the scan history." }, { status: 500 });
  }
}
