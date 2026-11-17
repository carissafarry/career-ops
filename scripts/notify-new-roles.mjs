#!/usr/bin/env node
// notify-new-roles.mjs: show a macOS notification when a scan has added new roles.
//
// A scheduled scan (web/scripts/scheduled-jobs-runner.mjs) appends one row per run to
// data/scan-runs.tsv. This script looks for rows it has not announced yet, sums their
// `new_added`, and shows ONE notification. It writes nothing but its own state file
// (data/.notify-state.json), so it can run on its own short timer without touching the
// runner. With terminal-notifier installed, clicking the notification opens the dashboard.
//
//   node scripts/notify-new-roles.mjs            announce unseen scan runs
//   node scripts/notify-new-roles.mjs --test     show a sample notification
//   node scripts/notify-new-roles.mjs --dry-run  print what it would show
//
// The first run only records the latest run (no notification), so installing it does
// not announce the whole backlog. Job titles come from untrusted job pages: they are
// cleaned, and passed to the notifier as arguments, never through a shell.

import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const DEFAULT_URL = "http://127.0.0.1:3000/pipeline";
const TITLE = "career-ops";

/** One line of safe text: no control characters, quotes or backticks, collapsed spaces, capped. */
export function cleanText(value, max = 80) {
  const text = String(value ?? "")
    .replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩]/g, " ")
    .replace(/["'`\\]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

const rows = (text) => String(text ?? "").split(/\r?\n/).filter(Boolean).map((line) => line.split("\t"));

/** Scan runs logged after `lastTimestamp`, oldest first, with the roles they added. */
export function unseenRuns(runsTsv, lastTimestamp) {
  const [header = [], ...body] = rows(runsTsv);
  const at = header.indexOf("timestamp");
  const added = header.indexOf("new_added");
  if (at < 0 || added < 0) return [];
  return body
    .map((cols) => ({ timestamp: cols[at] ?? "", added: Number.parseInt(cols[added] ?? "", 10) || 0 }))
    .filter((run) => run.timestamp && (!lastTimestamp || run.timestamp > lastTimestamp))
    .sort((a, b) => (a.timestamp < b.timestamp ? -1 : 1));
}

/** The newest `count` roles scan-history.tsv recorded as added: [{ company, role }], newest first. */
export function newestAdded(historyTsv, count) {
  const found = [];
  for (const cols of rows(historyTsv).reverse()) {
    if (cols[5] !== "added") continue;
    found.push({ role: cols[3] ?? "", company: cols[4] ?? "" });
    if (found.length >= count) break;
  }
  return found;
}

/** { subtitle, message } for the notification, or null when there is nothing to say. */
export function buildMessage(total, roles) {
  if (total <= 0) return null;
  const lines = roles.slice(0, 2).map((r) => cleanText([r.role, r.company && `at ${r.company}`].filter(Boolean).join(" "), 70));
  const more = total - lines.length;
  if (more > 0) lines.push(`and ${more} more`);
  return { subtitle: `${total} new role${total === 1 ? "" : "s"}`, message: lines.join(" · ") || "Open the pipeline to review." };
}

function findTerminalNotifier() {
  for (const candidate of ["/opt/homebrew/bin/terminal-notifier", "/usr/local/bin/terminal-notifier"]) {
    if (existsSync(candidate)) return candidate;
  }
  const found = spawnSync("which", ["terminal-notifier"], { encoding: "utf8" });
  return found.status === 0 ? found.stdout.trim() : "";
}

/** Show the notification. Click-to-open needs terminal-notifier; osascript is the fallback. */
export function notify({ subtitle, message }, url = DEFAULT_URL) {
  const notifier = findTerminalNotifier();
  if (notifier) {
    try {
      execFileSync(notifier, ["-title", TITLE, "-subtitle", subtitle, "-message", message, "-open", url, "-group", "career-ops-new-roles", "-sound", "Glass"], { stdio: "ignore" });
      return "terminal-notifier";
    } catch {
      // macOS has not allowed notifications for it (exit 1). Fall through to osascript.
    }
  }
  execFileSync("osascript", [
    "-e", "on run argv",
    "-e", "display notification (item 2 of argv) with title (item 3 of argv) subtitle (item 1 of argv) sound name \"Glass\"",
    "-e", "end run",
    subtitle, message, TITLE,
  ], { stdio: "ignore" });
  return "osascript";
}

const read = (file) => (existsSync(file) ? readFileSync(file, "utf8") : "");

async function main() {
  const args = new Set(process.argv.slice(2));
  const url = process.env.CAREER_OPS_DASHBOARD_URL || DEFAULT_URL;

  if (args.has("--test")) {
    const how = notify({ subtitle: "Test notification", message: "If you can read this, new-role alerts work." }, url);
    console.log(`sent with ${how}`);
    return;
  }

  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const { getCareerOpsRoot } = await import(pathToFileURL(path.join(root, "path-resolver.mjs")).href);
  const dataRoot = getCareerOpsRoot();
  const statePath = path.join(dataRoot, "data", ".notify-state.json");
  let last = "";
  try {
    last = JSON.parse(read(statePath) || "{}").lastTimestamp || "";
  } catch {
    last = "";
  }

  const runs = unseenRuns(read(path.join(dataRoot, "data", "scan-runs.tsv")), last);
  if (runs.length === 0) return;
  const newest = runs[runs.length - 1].timestamp;

  if (!last) {
    // First run: start from now instead of announcing the backlog.
    if (!args.has("--dry-run")) writeFileSync(statePath, JSON.stringify({ lastTimestamp: newest }));
    console.log("first run: starts from the latest scan, nothing announced");
    return;
  }

  const total = runs.reduce((sum, run) => sum + run.added, 0);
  const message = buildMessage(total, newestAdded(read(path.join(dataRoot, "data", "scan-history.tsv")), total));
  if (message) {
    if (args.has("--dry-run")) console.log(JSON.stringify(message));
    else console.log(`sent with ${notify(message, url)}: ${message.subtitle}`);
  }
  if (!args.has("--dry-run")) writeFileSync(statePath, JSON.stringify({ lastTimestamp: newest }));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    console.error(`notify-new-roles: ${error.message}`);
    process.exit(1);
  });
}
