import { careerOpsRoot } from "@/lib/career-ops";
import { spawnHeadlessCli } from "@/lib/spawn-cli.mjs";
import { CAPS } from "@/lib/worker-capabilities.mjs";
import { scopeFrom } from "@/lib/claude-invocation.mjs";

// A read-only advisor run: the CLI may read the CV and the report and nothing
// else. It writes nothing and reaches no network. Its reply is the whole output.
const ADVISOR_SCOPE = scopeFrom("Read,Glob,Grep");
const DEFAULT_TIMEOUT_MS = 90_000;
const MAX_OUTPUT = 64 * 1024;

type CliSpecLike = { id: string; args: (prompt: string) => string[] };

export function advisorArgs(spec: CliSpecLike, prompt: string): string[] {
  return spec.id === "claude"
    ? ["-p", prompt, "--strict-mcp-config", "--permission-mode", "acceptEdits", "--allowedTools", ADVISOR_SCOPE.allowed, "--disallowedTools", ADVISOR_SCOPE.disallowed]
    : spec.args(prompt);
}

export function askAdvisor(binPath: string, args: string[], cliId: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<{ text: string; error: string | null }> {
  return new Promise((resolve) => {
    let out = "";
    let err = "";
    let settled = false;
    const finish = (value: { text: string; error: string | null }) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    let child;
    try {
      child = spawnHeadlessCli(binPath, args, { cwd: careerOpsRoot(), env: process.env }, { cliId, capabilities: CAPS.localReadOnly });
    } catch (e) {
      resolve({ text: "", error: e instanceof Error ? e.message : "Could not start the CLI." });
      return;
    }
    const timer = setTimeout(() => {
      try { child.kill("SIGTERM"); } catch { /* close settles */ }
      finish({ text: out.trim(), error: out.trim() ? null : "The advisor took too long." });
    }, timeoutMs);
    child.stdout.on("data", (d: Buffer) => { out = (out + d.toString()).slice(0, MAX_OUTPUT); });
    child.stderr.on("data", (d: Buffer) => { err = (err + d.toString()).slice(-2000); });
    child.once("error", (e) => finish({ text: "", error: e.message }));
    child.once("close", () => {
      const text = out.trim();
      finish({ text, error: text ? null : err.trim().split(/\r?\n/).pop()?.slice(0, 200) || "No reply. Is the CLI signed in?" });
    });
  });
}
