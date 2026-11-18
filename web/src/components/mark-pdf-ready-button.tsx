"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { btn, btnDone } from "@/lib/action-styles";

export function MarkPdfReadyButton({
  reportNum,
  ready = false,
  trackerMarked = false,
}: {
  reportNum: number | null;
  ready?: boolean;
  trackerMarked?: boolean;
}) {
  const router = useRouter();
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (reportNum == null) return null;
  const settled = ready && trackerMarked;
  const markedWithoutFile = (trackerMarked || saved) && !ready;

  async function mark() {
    if (busy || settled || saved) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/pdf-ready", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ report: String(reportNum) }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(typeof body?.error === "string" ? body.error : "Could not mark the PDF ready.");
        return;
      }
      setSaved(true);
      router.refresh();
    } catch {
      setError("Could not mark the PDF ready.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex flex-col items-start gap-1">
      {markedWithoutFile ? (
        <span className="inline-flex items-center gap-1.5 py-2 text-sm text-muted"><Check className="size-3.5" /> Tracker marked</span>
      ) : (
        <button
          type="button"
          onClick={mark}
          disabled={busy || settled || saved}
          className={settled ? btnDone : btn}
        >
          {settled && <Check className="size-3.5" />}
          {busy ? "Saving…" : settled ? "PDF ready" : saved ? "Tracker marked" : "Mark PDF ready"}
        </button>
      )}
      {markedWithoutFile && (
        <span className="text-xs text-muted">Generate the tailored CV for this report. Marking the tracker again does not add that file.</span>
      )}
      {error && <span className="text-xs text-red-500">{error}</span>}
    </span>
  );
}
