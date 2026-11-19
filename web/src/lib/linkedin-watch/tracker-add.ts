import fs from "node:fs";
import path from "node:path";
import { careerOpsRoot } from "@/lib/career-ops";
import { runCoreCli } from "@/lib/core-cli";
import { resolveCodeRoot } from "@/lib/core/code-root.mjs";
import { setInboxSkip } from "@/lib/inbox-skip.mjs";
import { buildTrackerAddition } from "./tracker-tsv.mjs";

type Posting = { title: string; company: string; location: string; link: string };

const localDate = () => new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const lastLine = (text: string) => text.trim().split("\n").filter(Boolean).pop() ?? "";

// A posting that was first sent to the Inbox (data/pipeline.md, "Add to pipeline") is now a tracker row, so its
// inbox line is checked off instead of staying behind as a second, pending copy. Best effort: no match is fine.
async function closeInboxRow(url: string): Promise<void> {
  try {
    const root = careerOpsRoot();
    const lockModule = path.join(resolveCodeRoot(process.cwd(), process.env), "pipeline-lock.mjs");
    if (!fs.existsSync(lockModule)) return;
    await setInboxSkip(path.join(root, "data", "pipeline.md"), url, true, { lockModule });
  } catch {
    // the tracker row is already written; a busy or missing inbox must not undo that
  }
}

/**
 * Adds a posting the user applied to as an `Applied` tracker row, the way modes/tracker.md says to add a role
 * by hand: reserve a number, write the tracker-addition TSV, run merge-tracker.mjs, release the number.
 * merge-tracker updates the existing row instead when the company and role are already tracked.
 */
export async function addAppliedToTracker(posting: Posting): Promise<{ ok: boolean; error?: string }> {
  const reserved = await runCoreCli("reserve-report-num", []);
  const num = reserved.stdout.trim().split(/\s+/)[0] ?? "";
  if (reserved.code !== 0 || !/^\d+$/.test(num)) return { ok: false, error: "Could not reserve a tracker number." };
  let file = "";
  try {
    const { fileName, content } = buildTrackerAddition({ num, date: localDate(), posting });
    const dir = path.join(careerOpsRoot(), "batch", "tracker-additions");
    fs.mkdirSync(dir, { recursive: true });
    file = path.join(dir, fileName);
    fs.writeFileSync(file, content);
    const merged = await runCoreCli("merge-tracker", []);
    if (merged.code !== 0) {
      fs.rmSync(file, { force: true }); // never leave a half-added row waiting for the next merge
      return { ok: false, error: lastLine(merged.stderr || merged.stdout) || "The tracker merge failed." };
    }
    await closeInboxRow(posting.link);
    return { ok: true };
  } catch (e) {
    if (file) fs.rmSync(file, { force: true });
    return { ok: false, error: e instanceof Error ? e.message : "Could not write the tracker row." };
  } finally {
    await runCoreCli("reserve-report-num", ["--release", num]);
  }
}
