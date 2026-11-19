"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, ArrowRight, CheckCircle2, Clock, Copy, Edit3, Globe, Info, Loader2, MoreVertical, Pause, Play, Trash2, Zap } from "lucide-react";
import type { ScheduledJob } from "@/lib/scheduled-jobs";
import { scanEngineLabel, scheduleCadenceLabel } from "@/lib/schedule-label.mjs";
import { cn } from "@/lib/cn";
import { ErrorDetailModal } from "./error-detail-modal";

export function JobCard({
  job,
  onToggleStatus,
  onEdit,
  onCopy,
  onDelete,
  onRunFinished,
  scanRunning = false,
  runningHere = false,
}: {
  job: ScheduledJob;
  onToggleStatus: (id: string, currentStatus: string) => void;
  onEdit: (job: ScheduledJob) => void;
  onCopy: (job: ScheduledJob) => void;
  onDelete: (id: string) => void;
  onRunFinished: () => void;
  /** Another scan holds the runner right now, so Run now would only fail. */
  scanRunning?: boolean;
  /** This job is the one holding the runner, so only its card shows the spinner. */
  runningHere?: boolean;
}) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [openingScan, setOpeningScan] = useState(false);
  const [noScan, setNoScan] = useState(false);
  // The error the popup shows: the saved last error, or the one from this page's own Run now.
  const [detail, setDetail] = useState<{ message: string; at: string | null } | null>(null);
  const [runMessage, setRunMessage] = useState<string | null>(null);
  const [runError, setRunError] = useState<{ message: string; at: string } | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    if (menuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleEscape);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [menuOpen]);

  const handleRunNow = async () => {
    setRunning(true);
    setRunMessage(null);
    setRunError(null);

    try {
      const res = await fetch(`/api/scheduled-jobs/${job.id}/run`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Run failed");

      setRunMessage(` Completed! Found ${data.rolesFound || 0} matching roles.`);
      onRunFinished();
    } catch (err) {
      setRunError({ message: err instanceof Error ? err.message : "Run failed", at: new Date().toISOString() });
    } finally {
      setRunning(false);
    }
  };

  // The scan page for this job's last run. A run that left no scan record has no page to open.
  const seeLastScan = async () => {
    setOpeningScan(true);
    setNoScan(false);
    try {
      const res = await fetch(`/api/scheduled-jobs/${job.id}/last-scan`, { cache: "no-store" });
      const data = (await res.json().catch(() => null)) as { scanId?: string | null } | null;
      if (res.ok && data?.scanId) {
        router.push(`/scans?run=${encodeURIComponent(data.scanId)}`);
        return;
      }
      setNoScan(true);
    } catch {
      setNoScan(true);
    } finally {
      setOpeningScan(false);
    }
  };

  const isFull = job.engine === "full";
  const isActive = job.status === "active";
  const positiveList = job.filters?.positive || [];
  const letter = (job.name || "S").trim().charAt(0).toUpperCase();

  return (
    <div className="co-rise group flex min-w-0 flex-col justify-between h-full gap-2.5 rounded-xl border border-border bg-surface shadow-card p-3.5 text-left transition-all hover:-translate-y-0.5 hover:border-brand/30 hover:shadow-sm">
      <div className="space-y-2.5">
        {/* Top Header: Logo + Title + 3-Dots Menu */}
        <div className="flex items-start gap-3">
          <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand-soft text-sm font-semibold text-brand-text">
            {letter}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className={`font-display truncate text-[17px] leading-tight text-foreground transition-colors group-hover:text-brand-text`}>
              {job.name}
            </h2>
            <p className="mt-0.5 flex items-center gap-1.5 text-[14px] text-muted">
              <Clock className="size-3.5 text-faint" />
              {scheduleCadenceLabel(job.every, job.unit)} · {job.timezone}
            </p>
          </div>

          {/* 3-Dots Dropdown Menu */}
          <div className="relative shrink-0" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              aria-label={`Options for ${job.name}`}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              className="rounded p-1 text-faint transition-colors hover:bg-surface-hover hover:text-foreground"
              title="Options"
            >
              <MoreVertical className="size-4" />
            </button>

            {menuOpen && (
              <div role="menu" className="absolute right-0 top-full z-20 mt-1 w-36 overflow-hidden rounded-xl border border-border bg-surface shadow-xl backdrop-blur-md animate-in fade-in zoom-in-95">
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    onEdit(job);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-brand-soft hover:text-brand-text"
                >
                  <Edit3 className="size-3.5" /> Edit Scan
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    onCopy(job);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-brand-soft hover:text-brand-text"
                >
                  <Copy className="size-3.5" /> Copy Scan
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    onDelete(job.id);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-xs font-medium text-rose-500 transition-colors hover:bg-rose-500/10"
                >
                  <Trash2 className="size-3.5" /> Delete Scan
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Engine & Status Badges */}
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-medium",
              isFull ? "border-brand/30 bg-brand-soft/60 text-brand-text" : "border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-400"
            )}
          >
            {isFull ? <Globe className="size-3" /> : <Zap className="size-3" />}
            {scanEngineLabel(job.engine)}
          </span>

          <span
            className={cn(
              "inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-medium",
              isActive
                ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300"
                : "border-border bg-surface-hover text-muted"
            )}
          >
            <span className={cn("size-1.5 rounded-full", isActive ? "bg-emerald-500" : "bg-zinc-400")} />
            {job.status}
          </span>
        </div>

        {/* Keywords clamped to max 2 lines */}
        {positiveList.length > 0 && (
          <div className="max-h-12 overflow-hidden flex flex-wrap items-center gap-1.5 text-xs">
            <span className="text-faint shrink-0">matched:</span>
            {positiveList.map((kw, i) => (
              <span key={i} className="rounded border border-border px-1.5 py-0.5 font-medium text-muted truncate max-w-[140px]">
                {kw}
              </span>
            ))}
          </div>
        )}

        {/* Last Run & Status Message */}
        <div className="text-xs">
          {job.lastError ? (
            <p className="flex items-start gap-1.5 text-rose-500">
              <AlertCircle className="mt-0.5 size-3 shrink-0" />
              <span className="min-w-0 flex-1 truncate">Last error: {job.lastError}</span>
              <button
                type="button"
                onClick={() => setDetail({ message: job.lastError ?? "", at: job.lastRunAt ?? null })}
                aria-label={`Show the full error for ${job.name}`}
                title="Show the full error"
                className="-my-1 shrink-0 rounded p-1 text-rose-500 transition-colors hover:bg-rose-500/10 max-sm:min-h-[44px] max-sm:min-w-[44px]"
              >
                <Info className="mx-auto size-3.5" />
              </button>
            </p>
          ) : job.lastRunAt ? (
            <p className="flex items-center gap-1.5 text-emerald-800 dark:text-emerald-400">
              <CheckCircle2 className="size-3.5 shrink-0" />
              Last run {new Date(job.lastRunAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} ·{" "}
              {job.rolesFoundCount || 0} roles found
            </p>
          ) : (
            <p className="text-faint">No runs recorded yet</p>
          )}
          {job.lastRunAt && (
            <button
              type="button"
              onClick={() => void seeLastScan()}
              disabled={openingScan}
              className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-brand-text transition-colors hover:underline disabled:opacity-60 max-sm:min-h-[44px]"
            >
              {openingScan ? <Loader2 className="size-3 animate-spin" /> : null}
              See last scan
              {!openingScan && <ArrowRight className="size-3" />}
            </button>
          )}
          {noScan && (
            <p role="status" className="mt-1 text-faint">
              The last run left no scan record to show.{" "}
              <Link href="/scans" className="text-brand-text hover:underline">Open all scans</Link>
            </p>
          )}
          {runMessage && <p className="mt-1 font-medium text-brand-text">{runMessage}</p>}
          {runError && (
            <p role="alert" className="mt-1 flex items-start gap-1.5 text-rose-500">
              <AlertCircle className="mt-0.5 size-3 shrink-0" />
              <span className="min-w-0 flex-1 truncate">Run failed: {runError.message}</span>
              <button
                type="button"
                onClick={() => setDetail(runError)}
                aria-label={`Show the full error from running ${job.name}`}
                title="Show the full error"
                className="-my-1 shrink-0 rounded p-1 text-rose-500 transition-colors hover:bg-rose-500/10 max-sm:min-h-[44px] max-sm:min-w-[44px]"
              >
                <Info className="mx-auto size-3.5" />
              </button>
            </p>
          )}
        </div>
      </div>

      {/* Action Buttons Row pinned to bottom */}
      <div className="mt-auto pt-2 flex items-center gap-2 border-t border-border/40">
        <button
          type="button"
          onClick={handleRunNow}
          disabled={running || scanRunning}
          title={scanRunning && !running && !runningHere ? "Another scan is running. Run now works again when it finishes." : undefined}
          className="inline-flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-brand/30 px-2.5 py-2 text-xs font-medium text-brand-text transition-colors hover:bg-brand-soft disabled:opacity-50 max-sm:min-h-[44px]"
        >
          {running || runningHere ? <Loader2 className="size-3.5 animate-spin" /> : <Zap className="size-3.5" />}
          {running || runningHere ? "Scanning…" : "Run now"}
        </button>

        <button
          type="button"
          onClick={() => onToggleStatus(job.id, job.status)}
          className={cn(
            "inline-flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-2 text-xs font-medium transition-colors max-sm:min-h-[44px]",
            isActive ? "bg-surface-hover text-foreground hover:bg-brand-soft hover:text-brand-text" : "bg-emerald-500/10 text-emerald-800 dark:text-emerald-400"
          )}
        >
          {isActive ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
          {isActive ? "Pause" : "Resume"}
        </button>
      </div>
      {detail && <ErrorDetailModal isOpen onClose={() => setDetail(null)} title={job.name} at={detail.at} message={detail.message} />}
    </div>
  );
}
