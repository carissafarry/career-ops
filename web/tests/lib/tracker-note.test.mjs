// Editing a tracker row's Notes cell from the web, through set-status.mjs (locked, validated, atomic).
//
// Run: node --experimental-strip-types --test tests/lib/tracker-note.test.mjs

import test from "node:test";
import assert from "node:assert/strict";
import { cleanNote, buildNoteArgs, MAX_NOTE } from "../../src/lib/tracker-note.mjs";

test("a line break is stored as <br> (a table row is one line), a pipe becomes a slash", () => {
  assert.equal(cleanNote("  called HR\nwaiting | for reply  "), "called HR<br>waiting / for reply");
  assert.equal(cleanNote("a\t\tb"), "a b");
  assert.equal(cleanNote("a\r\n\r\n\nb\n"), "a<br>b", "CRLF, empty lines and a trailing break are tidied");
});

test("a stored <br> reads back as a line break, and cleaning it again changes nothing", async () => {
  const { noteToText } = await import("../../src/lib/tracker-note.mjs");
  const stored = cleanNote("line one\nline two");
  assert.equal(noteToText(stored), "line one\nline two");
  assert.equal(cleanNote(stored), stored);
  assert.equal(cleanNote("a<br/>b<BR>c"), "a<br>b<br>c");
});

test("a note is cut at the limit", () => {
  assert.equal(cleanNote("x".repeat(MAX_NOTE + 50)).length, MAX_NOTE);
  assert.ok(!cleanNote(("x".repeat(99) + "\n").repeat(10)).includes("<b>"), "a cut never leaves half a tag");
});

test("a row with no note yet gets the note added", () => {
  const r = buildNoteArgs({ row: "7", status: "Applied", previous: "", note: "applied via referral" });
  assert.deepEqual(r.args, ["--row", "7", "Applied", "--source", "web", "--json", "--note", "applied via referral"]);
});

test("a row that already has a note has that whole note replaced", () => {
  const r = buildNoteArgs({ row: "7", status: "Applied", previous: "Pipeline; Remote", note: "Pipeline; Remote; referral from Dina" });
  assert.deepEqual(r.args, ["--row", "7", "Applied", "--source", "web", "--json", "--replace-note", "Pipeline; Remote", "--note", "Pipeline; Remote; referral from Dina"]);
});

test("the previous note is cleaned the same way the tracker stores it, so it still matches", () => {
  const r = buildNoteArgs({ row: "7", status: "Applied", previous: "a  b", note: "c" });
  assert.equal(r.args[r.args.indexOf("--replace-note") + 1], "a b");
});

test("an unchanged note, an empty note, or a bad row is refused before anything runs", () => {
  assert.match(buildNoteArgs({ row: "7", status: "Applied", previous: "same", note: "same" }).error, /unchanged/i);
  assert.match(buildNoteArgs({ row: "7", status: "Applied", previous: "x", note: "   " }).error, /empty|clear/i);
  assert.match(buildNoteArgs({ row: "", status: "Applied", previous: "", note: "x" }).error, /row/i);
  assert.match(buildNoteArgs({ row: "7", status: "", previous: "", note: "x" }).error, /status/i);
});

test("a note written by an older evaluation shows without its dangling separators", async () => {
  const { tidyNote } = await import("../../src/lib/tracker-note.mjs");
  assert.equal(tidyNote("; posted: 2026-11-17"), "posted: 2026-11-17");
  assert.equal(tidyNote("; posted: 2026-11-19; Focused evaluation: summary"), "posted: 2026-11-19; Focused evaluation: summary");
  assert.equal(tidyNote("a; b; "), "a; b");
  assert.equal(tidyNote("  ;  "), "");
  assert.equal(tidyNote("a;b"), "a;b", "the inside of a note is left as written");
});
