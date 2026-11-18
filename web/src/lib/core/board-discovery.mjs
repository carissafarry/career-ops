import { spawn } from "node:child_process";
import path from "node:path";

/** Run one board's worker; resolves with { id, state, reason, offers } and never throws. */
export function runBoardWorker(id, request, { codeRoot, signal, timeoutMs = 120_000 }) {
  return new Promise((resolve) => {
    const worker = path.join(/* turbopackIgnore: true */ codeRoot, "web", "src", "lib", "core", "board-source.mjs");
    const child = spawn(process.execPath, [worker, "--worker", codeRoot, id], {
      cwd: codeRoot,
      stdio: ["pipe", "pipe", "pipe"],
      // windowsHide: see api/doctor/route.ts — a stale inherited console kills
      // every child with 0xC0000142 on Windows; never inherit one.
      windowsHide: true,
    });
    let output = "";
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      resolve(result);
    };
    const stop = (reason) => {
      try {
        child.kill("SIGKILL");
      } catch {
        /* already gone */
      }
      finish({ id, state: "failed", reason, offers: [] });
    };
    const abort = () => stop("scan interrupted");
    const timer = setTimeout(() => stop(`did not answer within ${Math.round(timeoutMs / 1000)}s`), timeoutMs);
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) abort();
    child.stdin.on("error", () => {});
    child.stdin.end(JSON.stringify(request));
    child.stdout.on("data", (data) => {
      output += data;
      if (output.length > 16_000_000) stop("response exceeded the size limit");
    });
    child.on("error", () => finish({ id, state: "failed", reason: "could not start", offers: [] }));
    child.on("close", () => {
      try {
        const result = JSON.parse(output);
        if (result.id !== id || !Array.isArray(result.offers) || !["complete", "incomplete", "failed"].includes(result.state)) {
          throw new Error("invalid result");
        }
        finish(result);
      } catch {
        finish({ id, state: "failed", reason: "returned no readable result", offers: [] });
      }
    });
  });
}
