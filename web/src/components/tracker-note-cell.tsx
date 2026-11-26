"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { cleanNote, noteToText, tidyNote } from "@/lib/tracker-note.mjs";

// The Notes cell of a tracker row: shows the note (cut to one line) and opens a small editor on click. Saving goes
// through /api/tracker/note, which edits only that cell under the tracker lock. The editor is a popover drawn on top
// of the page, so the table's fixed row height does not change.
export function TrackerNoteCell({ n, status, note }: { n: number | string; status: string; note: string }) {
  const router = useRouter();
  const [stored, setStored] = useState(note); // exactly as the tracker holds it: the edit replaces this text
  const shown = tidyNote(stored); // the note as stored: line breaks are <br>
  const shownText = noteToText(shown); // the same with real line breaks (editor, tooltip)
  const shownLine = shownText.replace(/\n/g, " · "); // the table cell is one line
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(note);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [at, setAt] = useState<{ top: number; left: number } | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const area = useRef<HTMLTextAreaElement>(null);

  useEffect(() => setStored(note), [note]);
  useEffect(() => {
    if (open) area.current?.focus();
  }, [open]);

  function openEditor() {
    const r = button.current?.getBoundingClientRect();
    if (!r) return;
    const width = 340;
    setAt({ top: Math.min(r.bottom + 6, window.innerHeight - 230), left: Math.max(8, Math.min(r.left, window.innerWidth - width - 28)) });
    setDraft(shownText);
    setError("");
    setOpen(true);
  }
  const close = () => { if (!busy) setOpen(false); };

  async function save() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/tracker/note", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ n, status, previous: stored, note: draft }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? "Could not save the note.");
        return;
      }
      setStored(cleanNote(draft));
      setOpen(false);
      router.refresh();
    } catch {
      setError("Could not reach the app. The note was not saved.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        ref={button}
        type="button"
        onClick={openEditor}
        title={shown ? `${shownText}\n\nClick to edit` : "Add a note"}
        aria-label={shown ? `Edit the note of application ${n}` : `Add a note to application ${n}`}
        className="group/note flex w-full min-w-0 max-w-64 items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-sm hover:bg-surface-hover"
      >
        {shown ? <span className="truncate text-muted">{shownLine}</span> : <span className="text-faint">Add note</span>}
        <Pencil className="size-3 shrink-0 text-faint opacity-0 transition-opacity group-hover/note:opacity-100 group-focus-visible/note:opacity-100" aria-hidden="true" />
      </button>
      {open && at && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-50" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
          <div
            role="dialog"
            aria-label={`Note for application ${n}`}
            style={{ top: at.top, left: at.left, width: 340 }}
            className="absolute rounded-xl border border-border bg-surface p-3 shadow-card"
            onKeyDown={(e) => {
              if (e.key === "Escape") close();
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && !busy) void save();
            }}
          >
            <textarea
              ref={area}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={4}
              maxLength={500}
              aria-label="Note"
              placeholder="e.g. interview moved to Friday"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
            />
            {error && <p role="alert" className="mt-1.5 text-xs text-red-700 dark:text-red-300">{error}</p>}
            <div className="mt-2 flex items-center justify-end gap-2">
              <button type="button" disabled={busy} onClick={close} className="rounded-full border border-border px-3 py-1.5 text-sm text-foreground disabled:opacity-50">Cancel</button>
              <button type="button" disabled={busy || cleanNote(draft) === cleanNote(shown) || cleanNote(draft) === ""} onClick={() => void save()} className="rounded-full bg-brand px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">
                {busy ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
