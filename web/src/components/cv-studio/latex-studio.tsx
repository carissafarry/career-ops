"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, FileText, Loader2, RotateCcw, Undo2 } from "lucide-react";
import { btn, btnPrimary } from "@/lib/action-styles";

export type LatexSlot = { id: string; kind: string; editable: boolean; original: string; current: string };

const KIND_LABEL: Record<string, string> = { summary: "Summary", bullet: "Experience bullets", skill: "Skills" };
const kindOf = (id: string) => id.replace(/-\d+$/, "");

// The Studio for a CV built from the candidate's own LaTeX file. Each text slot
// is editable as plain text; Rebuild recompiles the PDF with the fact check.
// Layout stays in the .tex, so only wording is exposed here.
export function LatexStudio({ n, slots, onSwitchToHtml }: { n: string; slots: LatexSlot[]; onSwitchToHtml?: () => void }) {
  const router = useRouter();
  const [text, setText] = useState<Record<string, string>>(() => Object.fromEntries(slots.map((s) => [s.id, s.current])));
  const [saved, setSaved] = useState<Record<string, string>>(() => Object.fromEntries(slots.map((s) => [s.id, s.current])));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [version, setVersion] = useState(0);

  const editable = useMemo(() => slots.filter((s) => s.editable), [slots]);
  const locked = slots.length - editable.length;
  const dirty = editable.some((s) => text[s.id] !== saved[s.id]);
  const groups = useMemo(() => {
    const by = new Map<string, LatexSlot[]>();
    for (const s of editable) by.set(kindOf(s.id), [...(by.get(kindOf(s.id)) ?? []), s]);
    return [...by.entries()];
  }, [editable]);

  const rebuild = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const patches = editable.filter((s) => text[s.id] !== s.original).map((s) => ({ id: s.id, text: text[s.id] }));
      const res = await fetch(`/api/latex-studio/${encodeURIComponent(n)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patches }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "The CV was not rebuilt.");
      setSaved({ ...text });
      setVersion((v) => v + 1);
      setMessage({ ok: true, text: `PDF rebuilt (${data.changed} text change${data.changed === 1 ? "" : "s"} from your file).` });
      window.dispatchEvent(new CustomEvent("co-job-done", { detail: { kind: "pdf", input: n } }));
      router.refresh();
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : "The CV was not rebuilt." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <section aria-label="Edit the wording" className="min-w-0">
        <h1 className="font-display text-xl text-landing">Your LaTeX CV</h1>
        <p className="mt-1 text-sm text-muted">
          Edit the wording below. Your layout, fonts and spacing stay as they are in your .tex file.
          {locked > 0 && ` ${locked} part${locked === 1 ? "" : "s"} with links are left as written.`}
        </p>

        <div className="sticky top-0 z-10 -mx-1 mt-3 flex flex-wrap items-center gap-2 bg-[var(--bg)]/90 px-1 py-2 backdrop-blur">
          <button type="button" onClick={rebuild} disabled={busy || !dirty} className={btnPrimary}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} Rebuild PDF
          </button>
          <button type="button" onClick={() => setText({ ...saved })} disabled={busy || !dirty} className={btn}>
            <Undo2 className="size-3.5" /> Discard edits
          </button>
          {onSwitchToHtml && (
            <button type="button" onClick={onSwitchToHtml} disabled={busy || dirty} className={btn} title="Edit the template (HTML) version of this CV instead. Saving it replaces the LaTeX PDF.">
              <FileText className="size-3.5" /> Switch to HTML CV
            </button>
          )}
          {message && (
            <span role={message.ok ? "status" : "alert"} className={message.ok ? "text-xs text-green-700 dark:text-green-400" : "text-xs text-red-700 dark:text-red-400"}>
              {message.text}
            </span>
          )}
        </div>

        {groups.map(([kind, list]) => (
          <div key={kind} className="mt-4">
            <h2 className="text-sm font-medium text-foreground">{KIND_LABEL[kind] ?? kind}</h2>
            <ul className="mt-2 flex flex-col gap-3">
              {list.map((s) => {
                const changed = text[s.id] !== s.original;
                return (
                  <li key={s.id} className="rounded-xl border border-border bg-surface p-3">
                    <textarea
                      value={text[s.id]}
                      onChange={(e) => setText((t) => ({ ...t, [s.id]: e.target.value }))}
                      rows={Math.max(2, Math.ceil(text[s.id].length / 70))}
                      aria-label={`${KIND_LABEL[kind] ?? kind} ${s.id}`}
                      className="w-full resize-y rounded-lg border border-border bg-transparent p-2 text-sm leading-relaxed text-foreground outline-none focus:border-brand/50 focus:ring-2 focus:ring-brand/20"
                    />
                    <div className="mt-1 flex items-center gap-2 text-xs text-faint">
                      <span>Bold is written as **bold**. Plain text only.</span>
                      {changed && (
                        <button type="button" onClick={() => setText((t) => ({ ...t, [s.id]: s.original }))} className="ml-auto inline-flex items-center gap-1 underline-offset-2 hover:text-foreground hover:underline">
                          <RotateCcw className="size-3" /> Back to my original
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </section>

      <section aria-label="PDF preview" className="min-w-0 lg:sticky lg:top-4 lg:self-start">
        <div className="rounded-2xl border border-border bg-surface p-3 shadow-card">
          <p className="mb-2 px-1 text-xs text-muted">PDF preview{dirty ? " (rebuild to see your edits)" : ""}</p>
          <iframe
            key={version}
            title="CV PDF preview"
            src={`/api/cv-pdf?n=${encodeURIComponent(n)}&v=${version}`}
            className="h-[80vh] w-full rounded-lg bg-white"
          />
        </div>
      </section>
    </div>
  );
}
