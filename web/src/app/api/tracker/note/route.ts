import fs from "node:fs";
import { rootScript } from "@/lib/career-ops";
import { runSetStatus } from "@/lib/core-cli";
import { canonicalizeStatus } from "@/lib/core/states";
import { parseCliJson, clientErrorMessage } from "@/lib/status-cli.mjs";
import { readJsonObject } from "@/lib/json-body";
import { buildNoteArgs } from "@/lib/tracker-note.mjs";

export const runtime = "nodejs"; // delegates to the core CLI via child_process

// Edits the Notes cell of an EXISTING tracker row, through set-status.mjs like /api/status: it holds the shared
// tracker lock, replaces the file atomically and touches only that cell. Body: { n, status, previous, note }, where
// `previous` is the note the editor was opened on. The CLI replaces exactly that text, so a note changed somewhere
// else in the meantime is refused (409), never silently overwritten.
const EXIT_TO_HTTP: Record<number, number> = { 2: 404, 3: 409, 4: 503 };

export async function POST(req: Request) {
  const body = await readJsonObject<{ n?: unknown; status?: unknown; previous?: unknown; note?: unknown }>(req);
  if (!body) return Response.json({ error: "bad json" }, { status: 400 });
  const status = typeof body.status === "string" ? canonicalizeStatus(body.status) : null;
  if (!status) return Response.json({ error: "The row's status is not a known status." }, { status: 400 });
  const built = buildNoteArgs({
    row: body.n,
    status,
    previous: typeof body.previous === "string" ? body.previous : "",
    note: typeof body.note === "string" ? body.note : "",
  });
  if ("error" in built) return Response.json({ error: built.error }, { status: 400 });

  if (!fs.existsSync(rootScript("set-status"))) {
    return Response.json({ error: "Editing notes needs the career-ops scripts; this root has data only.", code: "core-script-missing" }, { status: 503 });
  }
  const { code, stdout, stderr, spawnFailed, timedOut } = await runSetStatus(built.args);
  const parsed = parseCliJson(stdout);
  if (spawnFailed) {
    console.error(`/api/tracker/note: set-status.mjs failed to run: ${stderr.trim()}`);
    return Response.json({ error: "The note could not be saved." }, { status: 500 });
  }
  if (timedOut) return Response.json({ error: "Saving timed out; the note may or may not have been saved." }, { status: 504 });
  if (code !== 0) {
    const notFound = parsed?.code === "replace-note-not-found";
    return Response.json(
      { error: notFound ? "This note was changed somewhere else. Close this box and open it again to see the current note." : clientErrorMessage(parsed, stderr) },
      { status: notFound ? 409 : EXIT_TO_HTTP[code] ?? (code === 1 ? 400 : 500) },
    );
  }
  return Response.json({ ok: true });
}
