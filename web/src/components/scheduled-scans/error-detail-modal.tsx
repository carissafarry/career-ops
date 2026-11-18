"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertCircle, Check, Copy, X } from "lucide-react";
import { Modal } from "@/components/ui/modal";

// The card cuts a long error to one line. This shows all of it, as written by the runner,
// with a Copy button for pasting it into a bug report.
export function ErrorDetailModal({
  isOpen,
  onClose,
  title,
  at,
  message,
}: {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  /** ISO time of the run that failed, when known. */
  at?: string | null;
  message: string;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const [copied, setCopied] = useState<"idle" | "yes" | "failed">("idle");
  // The card this opens from is transformed on hover, which would make "fixed" mean "inside the
  // card". Rendering on the body keeps the dialog on the window.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!isOpen || !mounted) return null;
  const when = at ? new Date(at) : null;

  return createPortal(
    <Modal isOpen={isOpen} onClose={onClose} labelledBy="scan-error-title" initialFocusRef={closeRef} panelClassName="max-w-xl">
      <div className="flex items-start justify-between gap-3 border-b border-border pb-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400">
            <AlertCircle className="size-5" />
          </div>
          <div className="min-w-0">
            <h2 id="scan-error-title" className="truncate text-base font-semibold text-foreground">
              Last error
            </h2>
            <p className="truncate text-xs text-muted">
              {title}
              {when && !Number.isNaN(when.getTime()) ? ` · ${when.toLocaleString()}` : ""}
            </p>
          </div>
        </div>
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="rounded-lg p-1.5 text-faint hover:bg-surface-hover hover:text-foreground"
        >
          <X className="size-5" />
        </button>
      </div>

      <pre
        tabIndex={0}
        aria-label="Full error message"
        className="mt-4 max-h-[50vh] overflow-auto whitespace-pre-wrap break-words rounded-xl border border-border bg-surface-hover p-3 font-mono text-xs leading-relaxed text-foreground"
      >
        {message}
      </pre>

      <div className="mt-4 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(message);
              setCopied("yes");
            } catch {
              setCopied("failed");
            }
            window.setTimeout(() => setCopied("idle"), 1800);
          }}
          className="inline-flex items-center gap-1.5 rounded-full border border-border px-3.5 py-1.5 text-xs font-medium text-muted transition-colors hover:border-brand/40 hover:text-brand-text max-sm:min-h-[44px]"
        >
          {copied === "yes" ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          {copied === "yes" ? "Copied" : copied === "failed" ? "Copy failed" : "Copy error"}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full bg-brand px-4 py-1.5 text-xs font-medium text-brand-foreground transition-colors hover:bg-brand-200 max-sm:min-h-[44px]"
        >
          Done
        </button>
      </div>
    </Modal>,
    document.body,
  );
}
