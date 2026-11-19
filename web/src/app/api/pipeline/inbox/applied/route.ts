import { NextResponse } from "next/server";
import { pipelineSummary } from "@/lib/career-ops";
import { pendingInbox } from "@/lib/inbox-pending.mjs";
import { markInboxApplied } from "@/lib/inbox-applied.mjs";
import { cleanNote } from "@/lib/tracker-note.mjs";
import { addAppliedToTracker } from "@/lib/linkedin-watch/tracker-add";

export const runtime = "nodejs"; // runs the core tracker CLIs
export const dynamic = "force-dynamic";

// Body: { urls: string[], note?: string }. The note is written to the Notes cell of each row. Each pending inbox job becomes an `Applied` tracker row and its inbox line is closed,
// so a job can be marked applied without being shortlisted or scored first.
export async function POST(request: Request) {
  let urls: string[] = [];
  let note = "";
  try {
    const body = await request.json();
    urls = Array.isArray(body?.urls) ? body.urls.map(String) : [];
    note = typeof body?.note === "string" ? cleanNote(body.note) : "";
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  if (urls.length === 0) return NextResponse.json({ error: "No jobs chosen." }, { status: 400 });
  const result = await markInboxApplied(pendingInbox(pipelineSummary().inbox), urls, (posting, text) => addAppliedToTracker(posting, text), note);
  const allFailed = result.applied.length === 0 && result.failed.length > 0;
  return NextResponse.json(result, { status: allFailed ? 500 : 200 });
}
