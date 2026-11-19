// The arguments for editing a tracker row's Notes cell through set-status.mjs, the one write path that holds the
// tracker lock and replaces the file atomically. set-status needs a state, so the row's current status is passed
// back unchanged: that is a no-op on the status and does not write a ledger row.

export const MAX_NOTE = 500;

/** One line, no pipe (it would break the markdown row), cut at MAX_NOTE. */
export const cleanNote = (text) =>
  String(text ?? "").replace(/\|/g, "/").replace(/\s+/g, " ").trim().slice(0, MAX_NOTE);

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
