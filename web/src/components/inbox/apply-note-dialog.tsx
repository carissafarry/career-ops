"use client";

import { useEffect, useRef, useState } from "react";
import { CircleCheck } from "lucide-react";

// Asked when a Pipeline job is marked applied: confirm, and write a note at the same time. The note goes to the
// tracker row's Notes cell (for several jobs, the same note on each). It is optional.
export function ApplyNoteDialog({
  what,
  count,
  busy,
  onConfirm,
  onCancel,
}: {
  what: string;
  count: number;
  busy: boolean;
  onConfirm: (note: string) => void;
  onCancel: () => void;
}) {
  const [note, setNote] = useState("");
  const area = useRef<HTMLTextAreaElement>(null);
  useEffect(() => area.current?.focus(), []);

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onCancel(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="apply-note-title"
        className="w-full max-w-lg rounded-2xl border border-border bg-surface p-5 shadow-card"
        onKeyDown={(e) => {
          if (e.key === "Escape" && !busy) onCancel();
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && !busy) onConfirm(note);
        }}
      >
        <h2 id="apply-note-title" className="flex items-center gap-2 font-display text-lg text-landing">
          <CircleCheck className="size-5 text-brand-text" aria-hidden="true" /> Mark as applied
        </h2>
        <p className="mt-2 text-sm text-muted">
          {what} will be added to your tracker as <span className="font-medium text-foreground">Applied</span>.
        </p>
        <label className="mt-4 block text-xs text-muted">
          Note <span className="text-faint">· optional{count > 1 ? `, the same note goes on all ${count} rows` : ""}. Enter adds a new line, Ctrl or Cmd + Enter confirms.</span>
          <textarea
            ref={area}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            maxLength={500}
            placeholder="e.g. applied via referral, sent portfolio link"
            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
          />
        </label>
        <div className="mt-4 flex items-center justify-end gap-2">
          <button type="button" disabled={busy} onClick={onCancel} className="whitespace-nowrap rounded-full border border-border px-4 py-2 text-sm text-foreground disabled:opacity-50">Cancel</button>
          <button type="button" disabled={busy} onClick={() => onConfirm(note)} className="whitespace-nowrap rounded-full bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
            {busy ? "Adding…" : "Mark applied"}
          </button>
        </div>
      </div>
    </div>
  );
}
