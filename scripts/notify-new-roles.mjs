#!/usr/bin/env node
// notify-new-roles.mjs: show a macOS notification when a scan has added new roles.
//
// Every scan (the portals scan, the full ATS sweep, scheduled or by hand) appends the
// roles it adds to data/scan-history.tsv. This script remembers how far into that file
// it has read (a byte offset), counts the roles added since, and shows ONE notification.
// It writes nothing but its own state file (data/.notify-state.json), so it can run on
// its own short timer without touching the scanner. With terminal-notifier installed,
// clicking the notification opens the dashboard.
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
import { isMainModule } from "../lib/is-main-module.mjs";

// localhost, not 127.0.0.1: the browser keeps saved filters and settings per address.
const DEFAULT_URL = "http://localhost:3000/pipeline";
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

/**
 * Roles the scan history gained after `offset` bytes, newest first. Every scan, the
 * portals one, the full ATS sweep and the scheduled jobs, appends its finds to the
 * history, so this sees them all. Returns the roles and the offset to continue from.
 * An offset past the end (the file was rewritten shorter) restarts from the end
 * without announcing anything. Only whole lines count, so a half-written line waits.
 * @param {Buffer} history
 * @param {number} offset
 */
export function addedSince(history, offset) {
  const size = history.length;
  if (!Number.isInteger(offset) || offset < 0 || offset > size) return { roles: [], next: size, reset: true };
  const lastNewline = history.lastIndexOf(0x0a);
  const end = lastNewline < offset ? offset : lastNewline + 1;
  const roles = [];
  for (const cols of rows(history.subarray(offset, end).toString("utf8"))) {
    if (cols[5] === "added") roles.push({ role: cols[3] ?? "", company: cols[4] ?? "" });
  }
  return { roles: roles.reverse(), next: end, reset: false };
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
  const historyPath = path.join(dataRoot, "data", "scan-history.tsv");
  const history = existsSync(historyPath) ? readFileSync(historyPath) : Buffer.alloc(0);
  let offset;
  try {
    offset = JSON.parse(read(statePath) || "{}").historyOffset;
  } catch {
    offset = undefined;
  }
  const save = (next) => {
    if (!args.has("--dry-run")) writeFileSync(statePath, JSON.stringify({ historyOffset: next }));
  };

  if (offset === undefined) {
    // First run: start from the end of the history instead of announcing the backlog.
    save(history.length);
    console.log("first run: starts from the latest scan, nothing announced");
    return;
  }

  const { roles, next, reset } = addedSince(history, offset);
  if (reset) {
    save(next);
    console.log("history was rewritten: starting again from its end, nothing announced");
    return;
  }
  const message = buildMessage(roles.length, roles);
  if (message) {
    if (args.has("--dry-run")) console.log(JSON.stringify(message));
    else console.log(`sent with ${notify(message, url)}: ${message.subtitle}`);
  }
  save(next);
}

if (isMainModule(import.meta.url)) {
  main().catch((error) => {
    console.error(`notify-new-roles: ${error.message}`);
    process.exit(1);
  });
}
