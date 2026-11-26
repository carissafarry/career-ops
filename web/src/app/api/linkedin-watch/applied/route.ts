import { NextResponse } from "next/server";
import { careerOpsRoot } from "@/lib/career-ops";
import { markApplied } from "@/lib/linkedin-watch/api.mjs";
import { addAppliedToTracker } from "@/lib/linkedin-watch/tracker-add";
import { cleanNote } from "@/lib/tracker-note.mjs";
import { watchPaths } from "@/lib/linkedin-watch/store.mjs";

export const runtime = "nodejs"; // runs the core tracker CLIs
export const dynamic = "force-dynamic";

// Body: { ids: string[], note?: string }. The note is written to the Notes cell of each row. Each posting becomes an `Applied` row in the tracker.
export async function POST(request: Request) {
  let ids: string[] = [];
  let note = "";
  try {
    const body = await request.json();
    ids = Array.isArray(body?.ids) ? body.ids.map(String) : [];
    note = typeof body?.note === "string" ? cleanNote(body.note) : "";
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const r = await markApplied(watchPaths(careerOpsRoot()), ids, addAppliedToTracker, note);
  return NextResponse.json(r.body, { status: r.status });
}
