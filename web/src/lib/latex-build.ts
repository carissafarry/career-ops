import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import * as yaml from "js-yaml";
import { getProfilePath } from "@/lib/core/profile-path.mjs";
import { extractJsonObject } from "@/lib/extract-json-object.mjs";
import { MAX_SLOT_TEXT } from "@/lib/latex-cv.mjs";

export type Slot = { id: string; kind: string; text: string; plain: string; editable: boolean; span: { start: number; end: number } };
export type Patch = { id: string; text: string };
export type LatexCore = {
  buildManifest: (file: string, tex: string) => { supported: boolean; family: string | null; slots: Slot[]; error?: string };
  applyPatches: (tex: string, patches: Patch[], slots: Slot[], opts: { family: string | null }) => string;
};
export type LatexState = { patches: Patch[]; pdfMtimeMs: number; at: string };

const COMPILE_TIMEOUT_MS = 240_000;

/** The candidate's LaTeX file from config/profile.yml → latex.source, inside the data root. */
export function latexSource(root: string): { ok: true; file: string } | { ok: false; error: string } {
  let source: unknown;
  try {
    const profile = yaml.load(fs.readFileSync(getProfilePath(root), "utf8")) as { latex?: { source?: unknown } } | null;
    source = profile?.latex?.source;
  } catch {
    return { ok: false, error: "config/profile.yml could not be read." };
  }
  if (typeof source !== "string" || !source.trim()) return { ok: false, error: "No LaTeX CV is set. Add latex.source to config/profile.yml." };
  const file = path.resolve(root, source.trim());
  const rel = path.relative(root, file);
  if (rel.startsWith("..") || path.isAbsolute(rel)) return { ok: false, error: "latex.source must be a file inside the data folder." };
  if (!fs.existsSync(file)) return { ok: false, error: `latex.source points at a missing file: ${source.trim()}` };
  return { ok: true, file };
}

export function loadLatexCore(codeRoot: string): Promise<LatexCore> {
  return import(/* webpackIgnore: true */ pathToFileURL(path.join(codeRoot, "lib", "latex-content.mjs")).href);
}

/** Runs generate-latex.mjs (patched .tex → PDF, with the CV fact gate) and returns its JSON report. */
export function compile(codeRoot: string, root: string, tex: string, pdf: string, source: string): Promise<{ report: Record<string, unknown> | null; stderr: string; timedOut: boolean }> {
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const child = spawn(process.execPath, [path.join(codeRoot, "generate-latex.mjs"), tex, pdf, "--compile-only", "--source", source], {
      cwd: codeRoot,
      env: { ...process.env, CAREER_OPS_ROOT: root },
      windowsHide: true,
    });
    const timer = setTimeout(() => {
      timedOut = true;
      try { child.kill("SIGTERM"); } catch { /* close settles */ }
    }, COMPILE_TIMEOUT_MS);
    child.stdout.on("data", (d: Buffer) => { stdout = (stdout + d.toString()).slice(-256 * 1024); });
    child.stderr.on("data", (d: Buffer) => { stderr = (stderr + d.toString()).slice(-8 * 1024); });
    child.once("error", (e) => { clearTimeout(timer); resolve({ report: null, stderr: e.message, timedOut }); });
    child.once("close", () => {
      clearTimeout(timer);
      resolve({ report: extractJsonObject(stdout).obj as Record<string, unknown> | null, stderr: stderr.trim(), timedOut });
    });
  });
}

function statePath(root: string, reportNum: string) {
  return path.join(root, ".career-ops-web", "latex-cv", `${reportNum}.json`);
}

/** The patches behind the last LaTeX CV built for a report, or null when none was built. */
export function readLatexState(root: string, reportNum: string): LatexState | null {
  try {
    const raw = JSON.parse(fs.readFileSync(statePath(root, reportNum), "utf8"));
    if (!raw || !Array.isArray(raw.patches) || typeof raw.pdfMtimeMs !== "number") return null;
    const patches = raw.patches.filter((p: unknown): p is Patch => !!p && typeof (p as Patch).id === "string" && typeof (p as Patch).text === "string");
    return { patches, pdfMtimeMs: raw.pdfMtimeMs, at: typeof raw.at === "string" ? raw.at : "" };
  } catch {
    return null;
  }
}

/** Records the patches and the PDF's mtime, so a later HTML CV over the same file is detected. */
export function writeLatexState(root: string, reportNum: string, patches: Patch[], pdf: string) {
  const file = statePath(root, reportNum);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const state: LatexState = { patches, pdfMtimeMs: fs.statSync(pdf).mtimeMs, at: new Date().toISOString() };
  fs.writeFileSync(file, JSON.stringify(state, null, 2) + "\n");
}

/** True while the PDF on disk is still the one the LaTeX build wrote. */
export function latexStateIsCurrent(state: LatexState, pdf: string): boolean {
  try {
    return fs.statSync(pdf).mtimeMs === state.pdfMtimeMs;
  } catch {
    return false;
  }
}

/** Patches typed by the candidate: editable slots only, plain text only. */
export function cleanPatches(input: unknown, slots: Slot[]): { ok: true; patches: Patch[] } | { ok: false; error: string } {
  if (!Array.isArray(input)) return { ok: false, error: "patches required" };
  const editable = new Set(slots.filter((s) => s.editable).map((s) => s.id));
  const seen = new Set<string>();
  const patches: Patch[] = [];
  for (const p of input) {
    if (!p || typeof p.id !== "string" || typeof p.text !== "string") continue;
    if (!editable.has(p.id)) return { ok: false, error: `${p.id} cannot be edited.` };
    if (seen.has(p.id)) continue;
    const text = p.text.replace(/\s+/g, " ").trim();
    if (!text) return { ok: false, error: `${p.id} is empty.` };
    if (text.length > MAX_SLOT_TEXT) return { ok: false, error: `${p.id} is longer than ${MAX_SLOT_TEXT} characters.` };
    if (/[\\{}]/.test(text)) return { ok: false, error: `${p.id}: write plain text, without backslashes or braces.` };
    seen.add(p.id);
    patches.push({ id: p.id, text });
  }
  return { ok: true, patches };
}
