"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { FileCode2, Loader2, TriangleAlert } from "lucide-react";
import { btn } from "@/lib/action-styles";
import { resolveCliId } from "@/lib/saved-cli";

// Generates the CV from the candidate's own LaTeX file (config/profile.yml →
// latex.source). The agent only picks replacement wording for the text slots;
// the layout stays theirs. Hidden when no LaTeX file is set.
export function LatexCvButton({ n, onDone }: { n: string; onDone?: () => void }) {
  const router = useRouter();
  const [available, setAvailable] = useState(false);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [changes, setChanges] = useState<{ id: string; before: string; after: string }[]>([]);

  useEffect(() => {
    let alive = true;
    fetch(`/api/latex-cv/${encodeURIComponent(n)}`)
      .then((r) => r.json())
      .then((d) => alive && setAvailable(d?.available === true))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [n]);

  if (!available) return null;

  const run = async () => {
    setRunning(true);
    setMessage(null);
    setChanges([]);
    try {
      const cliId = await resolveCliId();
      const res = await fetch(`/api/latex-cv/${encodeURIComponent(n)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cliId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "The LaTeX CV was not generated.");
      setChanges(Array.isArray(data.changes) ? data.changes : []);
      setMessage({ ok: true, text: `CV ready from your LaTeX file (${data.patched} text changes${data.attempts > 1 ? `, ${data.attempts} tries` : ""}).` });
      // The new file changes what "last CV" and the CV row show.
      window.dispatchEvent(new CustomEvent("co-job-done", { detail: { kind: "pdf", input: n } }));
      router.refresh();
      onDone?.();
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : "The LaTeX CV was not generated." });
    } finally {
      setRunning(false);
    }
  };

  return (
    <>
      <button onClick={run} disabled={running} className={btn} title="Tailor your own LaTeX CV for this role. Your layout stays as it is; only the wording changes.">
        {running ? <Loader2 className="size-3.5 animate-spin" /> : <FileCode2 className="size-3.5" />}
        {running ? "Writing in your LaTeX style…" : "Generate from my LaTeX"}
      </button>
      {changes.length > 0 && (
        <details className="w-full max-w-3xl rounded-lg border border-border bg-surface px-3 py-2 text-xs">
          <summary className="cursor-pointer font-medium text-foreground">What changed in your LaTeX CV ({changes.length})</summary>
          <ul className="mt-2 space-y-2">
            {changes.map((c) => (
              <li key={c.id}>
                <p className="font-mono text-faint">{c.id}</p>
                <p className="text-muted line-through decoration-faint">{c.before}</p>
                <p className="text-foreground">{c.after}</p>
              </li>
            ))}
          </ul>
        </details>
      )}
      {message && (
        <p role={message.ok ? "status" : "alert"} className={`flex w-full max-w-2xl items-start gap-1 text-xs ${message.ok ? "text-muted" : "text-red-700 dark:text-red-400"}`}>
          {!message.ok && <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />}
          <span>{message.text}</span>
        </p>
      )}
    </>
  );
}
