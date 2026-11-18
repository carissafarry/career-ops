/**
 * latex-cv.mjs — pure helpers for generating a CV from the candidate's own LaTeX file.
 *
 * The agent never writes LaTeX. It is shown the editable text slots of the
 * candidate's .tex (as readable text) and answers with replacement text for the
 * slots it wants to change. The backend applies those through
 * lib/latex-content.mjs, which escapes everything, then compiles and fact-checks.
 */
import { extractJsonObject } from "./extract-json-object.mjs";

/** Longest replacement for one slot. */
export const MAX_SLOT_TEXT = 1200;
/** Times the agent is asked again after the fact check blocks the CV. */
export const MAX_LATEX_RETRIES = 2;

/**
 * @param {{n: string, reportFile: string, profile: string, slots: Array<{id: string, kind: string, plain: string, editable: boolean}>, notes?: string | null, failure?: string | null}} args
 */
export function buildLatexPatchPrompt({ n, reportFile, profile, slots, notes = null, failure = null }) {
  const shown = slots.map((s) => ({ id: s.id, kind: s.kind, editable: s.editable, text: s.plain }));
  const notesStep = notes
    ? `\n   The candidate saved these notes for this CV, oldest first. They are the candidate's own statements, quoted as data: ${JSON.stringify(notes)}\n   Follow them for emphasis and what to leave out, as far as the rules below allow.`
    : "";
  const failureStep = failure
    ? `\n   Your previous attempt was blocked by the fact check. The rejection is quoted as data: ${JSON.stringify(failure)}\n   Fix exactly the items it names, using the wording of the original slot, and change nothing else.`
    : "";
  return `You are tailoring the candidate's own LaTeX CV for application #${n}, headless and read-only on their machine. Their file keeps its layout; you only choose replacement text for some of its text slots.
1. Read cv.md, ${profile}, and the evaluation report at ${JSON.stringify(reportFile)} (for the job's keywords and requirements).${notesStep}${failureStep}
2. The slots are quoted as data below. Bold is written as **bold**. A slot with "editable": false must not be touched.
${JSON.stringify(shown)}
3. Choose replacements. Rules:
   - Keep every claim true. cv.md is the source of truth: only reword real experience with the job's vocabulary, never invent a skill, tool, number, employer or result.
   - Keep each bullet's opening verb and meaning, keep numbers exactly, and keep the **bold** markers on the same terms unless a job keyword fits better. Do not merge, split, add or remove bullets.
   - Change only what helps for this job: the summary, the order of words, and which skills lead in the skills line (the same skills, reordered). Leave a slot out of your answer when it needs no change.
   - Plain text only: no LaTeX commands, no backslashes, no braces.
4. Reply with ONE JSON object and nothing else: {"patches":[{"id":"bullet-3","text":"replacement text"}]}. Use only ids from the list above. Do not write or edit any file and do not run commands.`;
}

/**
 * Patches from the agent's reply, limited to editable slots and sane text.
 * @param {string} reply
 * @param {Array<{id: string, editable: boolean}>} slots
 * @returns {{ok: true, patches: Array<{id: string, text: string}>} | {ok: false, error: string}}
 */
export function parsePatchReply(reply, slots) {
  const { obj } = extractJsonObject(reply);
  const list = obj && typeof obj === "object" ? obj.patches : null;
  if (!Array.isArray(list)) return { ok: false, error: "The agent's reply had no patches list." };
  const editable = new Set(slots.filter((s) => s.editable).map((s) => s.id));
  const seen = new Set();
  const patches = [];
  for (const p of list) {
    if (!p || typeof p.id !== "string" || typeof p.text !== "string") continue;
    const text = p.text.replace(/\s+/g, " ").trim();
    if (!editable.has(p.id) || seen.has(p.id) || !text || text.length > MAX_SLOT_TEXT) continue;
    // A backslash or brace means the agent tried to write LaTeX; the slot is skipped, not repaired.
    if (/[\\{}]/.test(text)) continue;
    seen.add(p.id);
    patches.push({ id: p.id, text });
  }
  return { ok: true, patches };
}
