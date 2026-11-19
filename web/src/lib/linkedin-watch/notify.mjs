// macOS notification. Posting text is passed as argv, never interpolated into script source.
import { execFile } from "node:child_process";

const SCRIPT = "on run argv\ndisplay notification (item 2 of argv) with title (item 1 of argv)\nend run";

export function buildOsascriptArgs(title, body) {
  return ["-e", SCRIPT, String(title), String(body)];
}

export function notifyMac({ title, body }, run = execFile) {
  return new Promise((resolve) => {
    run("osascript", buildOsascriptArgs(title, body), (err) => {
      if (err) console.error("linkedin-watch: notification failed:", err.message);
      resolve();
    });
  });
}
