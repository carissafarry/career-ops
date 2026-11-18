import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { careerOpsRoot, findReportFile } from "@/lib/career-ops";
import { resolveCodeRoot } from "@/lib/core/code-root.mjs";
import { acquireTrackerWrite, releaseTrackerWrite } from "@/lib/core/run-registry";
import { localISODate } from "@/lib/followups";
import { readJsonObject } from "@/lib/json-body";
import { cleanPatches, compile, latexSource, latexStateIsCurrent, loadLatexCore, readLatexState, writeLatexState } from "@/lib/latex-build";
import { resolvePdfPaths } from "@/lib/pdf-paths.mjs";
import { markTrackerReady } from "@/lib/pdf-render.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type RouteContext = { params: Promise<{ n: string }> };

/** The Studio for a CV built from the candidate's LaTeX file: the text slots and what each says now. */
export async function GET(_req: Request, { params }: RouteContext) {
  const { n } = await params;
  if (!/^\d{1,6}$/.test(n)) return NextResponse.json({ error: "Invalid application number." }, { status: 400 });
  const root = careerOpsRoot();
  const source = latexSource(root);
  if (!source.ok) return NextResponse.json({ error: "no-latex" }, { status: 404 });
  const paths = resolvePdfPaths(n, localISODate(), root, findReportFile);
  if (!paths.ok) return NextResponse.json({ error: "no-report" }, { status: 404 });
  const { finalPdf, reportNum } = paths.paths;
  // Only while the PDF on disk is the one the LaTeX build wrote; an HTML CV over it ends that.
  const state = readLatexState(root, reportNum);
  if (!state || !latexStateIsCurrent(state, finalPdf)) return NextResponse.json({ error: "no-latex" }, { status: 404 });

  const core = await loadLatexCore(resolveCodeRoot(process.cwd(), process.env));
  const manifest = core.buildManifest(source.file, fs.readFileSync(source.file, "utf8"));
  if (!manifest.supported) return NextResponse.json({ error: "unreadable-layout" }, { status: 422 });
  const patched = new Map(state.patches.map((p) => [p.id, p.text]));
  return NextResponse.json({
    ok: true,
    reportNum,
    slots: manifest.slots.map((s) => ({ id: s.id, kind: s.kind, editable: s.editable, original: s.plain, current: patched.get(s.id) ?? s.plain })),
  });
}

/** Rebuilds the PDF from the candidate's own edits. The fact check still applies. */
export async function POST(req: Request, { params }: RouteContext) {
  const { n } = await params;
  if (!/^\d{1,6}$/.test(n)) return NextResponse.json({ error: "Invalid application number." }, { status: 400 });
  const body = await readJsonObject<{ patches?: unknown }>(req);
  if (!body) return NextResponse.json({ error: "Bad request." }, { status: 400 });

  const root = careerOpsRoot();
  const codeRoot = resolveCodeRoot(process.cwd(), process.env);
  const source = latexSource(root);
  if (!source.ok) return NextResponse.json({ error: source.error }, { status: 400 });
  if (!fs.existsSync(path.join(root, "cv.md"))) return NextResponse.json({ error: "cv.md is missing, so the CV cannot be fact-checked." }, { status: 400 });
  const paths = resolvePdfPaths(n, localISODate(), root, findReportFile);
  if (!paths.ok) return NextResponse.json({ error: paths.error }, { status: 404 });
  const { finalPdf, reportNum } = paths.paths;

  const core = await loadLatexCore(codeRoot);
  const tex = fs.readFileSync(source.file, "utf8");
  const manifest = core.buildManifest(source.file, tex);
  if (!manifest.supported) return NextResponse.json({ error: manifest.error ?? "This LaTeX layout is not supported." }, { status: 422 });
  const cleaned = cleanPatches(body.patches, manifest.slots);
  if (!cleaned.ok) return NextResponse.json({ error: cleaned.error }, { status: 400 });
  // Unchanged text is not a patch.
  const original = new Map(manifest.slots.map((s) => [s.id, s.plain]));
  const patches = cleaned.patches.filter((p) => p.text !== original.get(p.id));

  const buildTex = path.join(path.dirname(source.file), `.career-ops-build-${reportNum}.tex`);
  const guard = acquireTrackerWrite();
  try {
    fs.writeFileSync(buildTex, core.applyPatches(tex, patches, manifest.slots, { family: manifest.family }));
    const built = await compile(codeRoot, root, buildTex, finalPdf, source.file);
    if (built.timedOut) return NextResponse.json({ error: "Compiling the LaTeX CV took too long." }, { status: 504 });
    const fact = built.report?.factCheck as { verdict?: string } | undefined;
    if (fact?.verdict === "block") {
      return NextResponse.json({ error: `The fact check blocked this edit: ${JSON.stringify(fact).slice(0, 500)}` }, { status: 422 });
    }
    if (!built.report || built.report.compiled !== true || !fs.existsSync(finalPdf)) {
      const why = typeof built.report?.error === "string" ? built.report.error : built.stderr.split(/\r?\n/).pop() || "The LaTeX compile failed.";
      return NextResponse.json({ error: `LaTeX did not compile: ${why}`.slice(0, 400) }, { status: 500 });
    }
    writeLatexState(root, reportNum, patches, finalPdf);
    const marked = await markTrackerReady({ spawnFn: spawn, execPath: process.execPath, coreRoot: codeRoot, reportNum, dataRoot: root });
    return NextResponse.json({ ok: true, changed: patches.length, trackerMarked: marked.ok });
  } finally {
    releaseTrackerWrite(guard);
    try { fs.rmSync(buildTex, { force: true }); } catch { /* a leftover build file is the smaller failure */ }
  }
}
