import path from "node:path";
import { NextResponse } from "next/server";
import { careerOpsRoot, findReportFile } from "@/lib/career-ops";
import { cliUnavailableError, resolveCliOrFallback } from "@/lib/clis";
import { profileRef } from "@/lib/core/profile-path.mjs";
import { readJsonObject } from "@/lib/json-body";
import { advisorArgs, askAdvisor } from "@/lib/cli-advisor";
import { buildNotesFeedbackPrompt, parseNote } from "@/lib/cv-instructions.mjs";
import { appendNote, clearNotes, isNoteKey, readNotes } from "@/lib/cv-notes-store.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

type RouteContext = { params: Promise<{ n: string }> };

export async function GET(_req: Request, { params }: RouteContext) {
  const { n } = await params;
  if (!isNoteKey(n)) return NextResponse.json({ error: "Invalid application number." }, { status: 400 });
  return NextResponse.json({ messages: readNotes(careerOpsRoot(), n) });
}

export async function DELETE(_req: Request, { params }: RouteContext) {
  const { n } = await params;
  if (!isNoteKey(n)) return NextResponse.json({ error: "Invalid application number." }, { status: 400 });
  clearNotes(careerOpsRoot(), n);
  return NextResponse.json({ messages: [] });
}

export async function POST(req: Request, { params }: RouteContext) {
  const { n } = await params;
  if (!isNoteKey(n)) return NextResponse.json({ error: "Invalid application number." }, { status: 400 });
  const body = await readJsonObject<{ message?: unknown; cliId?: unknown }>(req);
  if (!body) return NextResponse.json({ error: "Bad request." }, { status: 400 });

  const note = parseNote(body.message);
  if (!note.ok) return NextResponse.json({ error: note.error }, { status: 400 });
  const reportAbs = findReportFile(n);
  if (!reportAbs) return NextResponse.json({ error: `No report #${n} found. Evaluate this posting first.` }, { status: 404 });

  // Saved before the advisor runs, so the note survives if the feedback fails.
  const root = careerOpsRoot();
  const thread = appendNote(root, n, "user", note.text);

  const requested = typeof body.cliId === "string" ? body.cliId : "";
  const resolved = requested ? resolveCliOrFallback(requested) : null;
  if (!resolved) {
    return NextResponse.json({ messages: thread, feedbackError: cliUnavailableError(requested || "none").error ?? "No CLI configured." });
  }
  const { spec, binPath } = resolved;
  const prompt = buildNotesFeedbackPrompt({
    n,
    reportFile: path.relative(root, reportAbs).split(path.sep).join("/"),
    profile: profileRef(root),
    notes: thread,
  });
  const reply = await askAdvisor(binPath, advisorArgs(spec, prompt), spec.id);
  if (!reply.text) return NextResponse.json({ messages: thread, feedbackError: reply.error });
  return NextResponse.json({ messages: appendNote(root, n, "assistant", reply.text) });
}
