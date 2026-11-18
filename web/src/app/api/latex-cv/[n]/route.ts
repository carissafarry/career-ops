import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { careerOpsRoot, findReportFile } from "@/lib/career-ops";
import { advisorArgs, askAdvisor } from "@/lib/cli-advisor";
import { cliUnavailableError, resolveCliOrFallback } from "@/lib/clis";
import { resolveCodeRoot } from "@/lib/core/code-root.mjs";
import { profileRef } from "@/lib/core/profile-path.mjs";
import { acquireTrackerWrite, releaseTrackerWrite } from "@/lib/core/run-registry";
import { userNotesText } from "@/lib/cv-instructions.mjs";
import { readNotes } from "@/lib/cv-notes-store.mjs";
import { localISODate } from "@/lib/followups";
import { readJsonObject } from "@/lib/json-body";
import { compile, latexSource, loadLatexCore, writeLatexState } from "@/lib/latex-build";
import { buildLatexPatchPrompt, MAX_LATEX_RETRIES, parsePatchReply } from "@/lib/latex-cv.mjs";
import { resolvePdfPaths } from "@/lib/pdf-paths.mjs";
import { markTrackerReady } from "@/lib/pdf-render.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 800;

type RouteContext = { params: Promise<{ n: string }> };
const AGENT_TIMEOUT_MS = 240_000;

export async function GET(_req: Request, { params }: RouteContext) {
  const { n } = await params;
  if (!/^\d{1,6}$/.test(n)) return NextResponse.json({ error: "Invalid application number." }, { status: 400 });
  const found = latexSource(careerOpsRoot());
  return NextResponse.json(found.ok ? { available: true } : { available: false, reason: found.error });
}

export async function POST(req: Request, { params }: RouteContext) {
  const { n } = await params;
  if (!/^\d{1,6}$/.test(n)) return NextResponse.json({ error: "Invalid application number." }, { status: 400 });
  const body = await readJsonObject<{ cliId?: unknown }>(req);
  if (!body) return NextResponse.json({ error: "Bad request." }, { status: 400 });

  const root = careerOpsRoot();
  const codeRoot = resolveCodeRoot(process.cwd(), process.env);
  const source = latexSource(root);
  if (!source.ok) return NextResponse.json({ error: source.error }, { status: 400 });
  if (!fs.existsSync(path.join(root, "cv.md"))) return NextResponse.json({ error: "cv.md is missing, so the CV cannot be fact-checked." }, { status: 400 });
  const resolvedPaths = resolvePdfPaths(n, localISODate(), root, findReportFile);
  if (!resolvedPaths.ok) return NextResponse.json({ error: resolvedPaths.error }, { status: 404 });
  const { reportFile, finalPdf, reportNum } = resolvedPaths.paths;

  const requested = typeof body.cliId === "string" ? body.cliId : "";
  const resolved = requested ? resolveCliOrFallback(requested) : null;
  if (!resolved) return NextResponse.json({ error: cliUnavailableError(requested || "none").error }, { status: 404 });
  const { spec, binPath } = resolved;

  const core = await loadLatexCore(codeRoot);
  const tex = fs.readFileSync(source.file, "utf8");
  const manifest = core.buildManifest(source.file, tex);
  if (!manifest.supported) return NextResponse.json({ error: manifest.error ?? "This LaTeX layout is not supported." }, { status: 422 });

  const notes = userNotesText(readNotes(root, n));
  const buildTex = path.join(path.dirname(source.file), `.career-ops-build-${reportNum}.tex`);
  const guard = acquireTrackerWrite();
  let failure: string | null = null;
  try {
    for (let attempt = 0; attempt <= MAX_LATEX_RETRIES; attempt++) {
      const prompt = buildLatexPatchPrompt({ n, reportFile, profile: profileRef(root), slots: manifest.slots, notes, failure });
      const reply = await askAdvisor(binPath, advisorArgs(spec, prompt), spec.id, AGENT_TIMEOUT_MS);
      if (!reply.text) return NextResponse.json({ error: reply.error || "The agent gave no reply." }, { status: 502 });
      const parsed = parsePatchReply(reply.text, manifest.slots);
      if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 502 });

      // Patch the candidate's own file next to its class files, compile, fact-check.
      const patched = core.applyPatches(tex, parsed.patches, manifest.slots, { family: manifest.family });
      fs.writeFileSync(buildTex, patched);
      const built = await compile(codeRoot, root, buildTex, finalPdf, source.file);
      const report = built.report;
      const fact = report?.factCheck as { verdict?: string } | undefined;
      if (built.timedOut) return NextResponse.json({ error: "Compiling the LaTeX CV took too long." }, { status: 504 });
      if (fact?.verdict === "block") {
        failure = `Fact check failed: ${JSON.stringify(fact).slice(0, 1400)}`;
        continue;
      }
      if (!report || report.compiled !== true || !fs.existsSync(finalPdf)) {
        const why = typeof report?.error === "string" ? report.error : built.stderr.split(/\r?\n/).pop() || "The LaTeX compile failed.";
        return NextResponse.json({ error: `LaTeX did not compile: ${why}`.slice(0, 400) }, { status: 500 });
      }
      writeLatexState(root, reportNum, parsed.patches, finalPdf);
      const marked = await markTrackerReady({ spawnFn: spawn, execPath: process.execPath, coreRoot: codeRoot, reportNum, dataRoot: root });
      return NextResponse.json({
        ok: true,
        pdf: path.relative(root, finalPdf),
        patched: parsed.patches.length,
        // What the agent changed, as readable text, so the page can show it.
        changes: parsed.patches.map((p) => ({ id: p.id, before: manifest.slots.find((x) => x.id === p.id)?.plain ?? "", after: p.text })),
        attempts: attempt + 1,
        trackerMarked: marked.ok,
      });
    }
    return NextResponse.json({ error: `The fact check blocked the CV after ${MAX_LATEX_RETRIES + 1} tries. ${failure ?? ""}`.slice(0, 600) }, { status: 422 });
  } finally {
    releaseTrackerWrite(guard);
    try { fs.rmSync(buildTex, { force: true }); } catch { /* a leftover build file is the smaller failure */ }
  }
}
