// The arguments for editing a tracker row's Notes cell through set-status.mjs, the one write path that holds the
// tracker lock and replaces the file atomically. set-status needs a state, so the row's current status is passed
// back unchanged: that is a no-op on the status and does not write a ledger row.

export const MAX_NOTE = 500;

const BREAK_TAG = /<br\s*\/?>/gi;

/**
 * One table cell: a pipe would break the markdown row, so it becomes a slash. A line break cannot live in a
 * table row either, so each one is stored as `<br>` (the markdown table convention) and read back as a line break
 * by `noteToText`. Spaces inside a line are collapsed, empty lines are dropped, the text is cut at MAX_NOTE.
 * Idempotent: a stored `<br>` comes back as the same `<br>`.
 */
export const cleanNote = (text) => {
  const lines = String(text ?? "")
    .replace(/\|/g, "/")
    .replace(BREAK_TAG, "\n")
    .split(/\r\n|\r|\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  return lines.join("\n").slice(0, MAX_NOTE).split("\n").join("<br>");
};

/** A stored note as plain text with real line breaks, for the editor and tooltips. */
export const noteToText = (stored) => String(stored ?? "").replace(BREAK_TAG, "\n");

/**
 * @param {{row: unknown, status: unknown, previous?: string, note: string}} input `previous` is the note the editor
 *   was opened on; the CLI replaces exactly that, so an edit made elsewhere in the meantime is refused, not overwritten.
 * @returns {{args: string[]} | {error: string}}
 */
export function buildNoteArgs({ row, status, previous = "", note }) {
  const rowArg = String(row ?? "").trim();
  if (!/^\d+$/.test(rowArg)) return { error: "The row must be a tracker number." };
  const state = String(status ?? "").trim();
  if (!state) return { error: "The row's status is needed." };
  const next = cleanNote(note);
  if (!next) return { error: "The note is empty. Write something, or press Cancel." };
  const old = cleanNote(previous);
  if (next === old) return { error: "The note is unchanged." };
  const base = ["--row", rowArg, state, "--source", "web", "--json"];
  return { args: old ? [...base, "--replace-note", old, "--note", next] : [...base, "--note", next] };
}

/** A stored note shown without dangling separators ("; posted: 2026-11-17" from older evaluations). The inside is untouched. */
export const tidyNote = (text) => String(text ?? "").replace(/^[\s;]+|[\s;]+$/g, "");
