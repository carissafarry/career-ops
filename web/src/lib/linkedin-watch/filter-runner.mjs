// Starts filter-worker.mjs and returns the ids of the cards that pass the user's filters.
import { spawn } from "node:child_process";

export function runFilterWorker({ workerPath, corePath, filters, cards, timeoutMs = 45_000, nodePath = process.execPath }) {
  return new Promise((resolve, reject) => {
    const child = spawn(nodePath, [workerPath, corePath], { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
    let out = "";
    let err = "";
    const timer = setTimeout(() => { child.kill("SIGKILL"); reject(new Error("filter timed out")); }, timeoutMs);
    child.stdout.on("data", (d) => { out += d; });
    child.stderr.on("data", (d) => { err += d; });
    child.on("error", (e) => { clearTimeout(timer); reject(e); });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        const line = err.trim().split("\n").find((l) => /Error/.test(l)) ?? err.trim().split("\n").pop() ?? "";
        return reject(new Error(line || `filter exited with code ${code}`));
      }
      try {
        resolve(new Set(JSON.parse(out).keep));
      } catch {
        reject(new Error("filter returned unreadable output"));
      }
    });
    child.stdin.end(JSON.stringify({ filters, cards }));
  });
}
