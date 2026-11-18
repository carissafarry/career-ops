/**
 * cv-notes-store.mjs — the notes thread for one application's CV.
 *
 * One JSON file per application under data/cv-notes/ (user layer, gitignored).
 * Written whole through a temp file and a rename so a crash never leaves half a
 * thread behind.
 */
import fs from "node:fs";
import path from "node:path";

const KEEP = 200;

/** @typedef {{role: "user" | "assistant", content: string, at: string}} NoteMessage */

/** @param {string} n */
export function isNoteKey(n) {
  return typeof n === "string" && /^\d{1,6}$/.test(n);
}

/** @param {string} root @param {string} n */
function filePath(root, n) {
  return path.join(root, "data", "cv-notes", `${n}.json`);
}

/**
 * @param {string} root
 * @param {string} n
 * @returns {NoteMessage[]}
 */
export function readNotes(root, n) {
  if (!isNoteKey(n)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath(root, n), "utf8"));
    const list = Array.isArray(parsed?.messages) ? parsed.messages : [];
    return list
      .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
      .map((m) => ({ role: m.role, content: m.content, at: typeof m.at === "string" ? m.at : "" }));
  } catch {
    return [];
  }
}

/**
 * @param {string} root
 * @param {string} n
 * @param {"user" | "assistant"} role
 * @param {string} content
 * @param {Date} [now]
 * @returns {NoteMessage[]}
 */
export function appendNote(root, n, role, content, now = new Date()) {
  if (!isNoteKey(n)) throw new Error("Invalid application number.");
  const messages = [...readNotes(root, n), { role, content, at: now.toISOString() }].slice(-KEEP);
  const file = filePath(root, n);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify({ messages }, null, 2));
  fs.renameSync(tmp, file);
  return messages;
}

/** @param {string} root @param {string} n */
export function clearNotes(root, n) {
  if (!isNoteKey(n)) return;
  fs.rmSync(filePath(root, n), { force: true });
}
