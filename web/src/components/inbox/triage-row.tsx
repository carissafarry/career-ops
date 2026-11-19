"use client";

import Link from "next/link";
import { Bookmark, BookmarkCheck, CircleCheck, Loader2, X, CirclePause } from "lucide-react";
import type { InboxJob } from "@/lib/career-ops";
import { PLATFORM_LABEL, type PlatformSource } from "@/lib/inbox";
import { unscoredInboxHref } from "@/lib/posting-url.mjs";
import { Badge } from "@/components/ui/badge";
import { CompanyLogo } from "@/components/company-logo";
import { cn } from "@/lib/cn";
import { AgeLabel } from "@/components/live-age";
import { inboxScoreTarget } from "@/lib/inbox-score-target.mjs";

export type RowScore = { score: number | null; tone: "good" | "warn" | "bad" | "muted"; jobId: string; running: boolean; reportN?: number | null; needsReview?: boolean };

// One raw posting in the triage list. Shows ONLY cheap, free signals + an honest
// "not scored" (CRUDA) — never a fake match%. Once its shortlist eval finishes it
// flips to EVALUADA (a real A–F badge). Save→shortlist / Skip→hidden are free + undoable.
export function TriageRow({
  index,
  cursor,
  job,
  source,
  reason,
  scored,
  selected,
  shortlisted,
  onToggleSelect,
  onSave,
  onApplied,
  onSkip,
}: {
  index: number;
  cursor: boolean;
  job: InboxJob;
  source: PlatformSource | null;
  reason?: string;
  scored?: RowScore;
  selected: boolean;
  shortlisted: boolean;
  onToggleSelect: () => void;
  onSave: () => void;
  onApplied: () => void;
  onSkip: () => void;
}) {
  const target = inboxScoreTarget(scored);
  const evaluated = target.evaluated;
  const postingHref = unscoredInboxHref(job.url, evaluated);
  const title = (
    <>
      <span className="font-medium text-foreground">{job.company}</span>
      <span className="text-muted"> · {job.role}</span>
    </>
  );

  return (
    <li
      data-triage-index={index}
      className={cn(
        "flex items-center gap-2.5 px-3 py-2.5 transition-colors sm:gap-3 sm:px-4",
        selected ? "bg-brand-soft/50" : "hover:bg-surface-hover",
        cursor && "ring-2 ring-inset ring-brand",
        evaluated && "opacity-95",
      )}
    >
      {/* multi-select — power-user batch to shortlist */}
      <input
        type="checkbox"
        checked={selected}
        onChange={onToggleSelect}
        aria-label={`Select ${job.company} ${job.role}`}
        className="size-4 shrink-0 accent-brand max-sm:min-h-[44px] max-sm:min-w-[24px]"
      />

      <CompanyLogo name={job.company} size={20} />

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm">
          {postingHref ? (
            <a href={postingHref} target="_blank" rel="noreferrer" className="hover:text-brand-text">
              {title}
            </a>
          ) : (
            title
          )}
        </p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-faint">
          {job.location && <span className="truncate">{job.location}</span>}
          {source && <span className="rounded bg-surface-hover px-1 py-px font-medium text-muted">{PLATFORM_LABEL[source]}</span>}
          <AgeLabel postedDate={job.postedAt} exact={job.postedAtExact} />
          {reason ? <span className="text-muted">{reason}</span> : null}
          {!evaluated && <span className="italic text-muted">not scored</span>}
        </p>
      </div>

      {/* EVALUADA state (right-aligned, visually distinct from raw rows) */}
      {scored?.needsReview ? (
        <div className="flex shrink-0 items-center gap-1">
          <Link href={`/jobs/${scored.jobId}`} className="flex items-center gap-1.5 text-xs text-amber-800 dark:text-amber-400">
            <CirclePause className="size-3.5" /> Needs review
          </Link>
          <button
            type="button"
            onClick={onSkip}
            title="Skip — hide from the inbox"
            aria-label={`Skip ${job.company} ${job.role}`}
            className="inline-flex items-center justify-center rounded-md p-1 text-faint transition-colors hover:bg-surface-hover hover:text-foreground max-sm:min-h-[44px] max-sm:min-w-[44px]"
          >
            <X className="size-4" />
          </button>
        </div>
      ) : evaluated && target.href ? (
        <Link href={target.href} className="flex shrink-0 items-center gap-1.5 text-xs">
          {scored!.running ? (
            <>
              <Loader2 className="size-3.5 animate-spin text-brand-text" />
              <span className="text-brand-text max-sm:hidden">Scoring…</span>
            </>
          ) : target.showScore ? (
            <Badge tone={scored!.tone}>{scored!.score}/5</Badge>
          ) : (
            <span className="text-brand-text">Report</span>
          )}
        </Link>
      ) : (
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={onSave}
            title={shortlisted ? "In your shortlist — click to remove" : "Save to shortlist"}
            aria-pressed={shortlisted}
            className={cn(
              "inline-flex items-center justify-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors max-sm:min-h-[44px] max-sm:min-w-[44px]",
              shortlisted ? "text-brand-text" : "text-muted hover:bg-surface-hover hover:text-brand-text",
            )}
          >
            {shortlisted ? <BookmarkCheck className="size-4" /> : <Bookmark className="size-4" />}
            <span className="max-sm:hidden">{shortlisted ? "Saved" : "Save"}</span>
          </button>
          <button
            type="button"
            onClick={onApplied}
            title="Already applied: add it to your tracker as Applied, no scoring needed"
            aria-label={`Mark ${job.company} ${job.role} as applied`}
            className="inline-flex items-center justify-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-muted transition-colors hover:bg-surface-hover hover:text-brand-text max-sm:min-h-[44px] max-sm:min-w-[44px]"
          >
            <CircleCheck className="size-4" />
            <span className="max-sm:hidden">Applied</span>
          </button>
          <button
            type="button"
            onClick={onSkip}
            title="Skip — hide from the inbox"
            className="inline-flex items-center justify-center rounded-md p-1 text-faint transition-colors hover:bg-surface-hover hover:text-foreground max-sm:min-h-[44px] max-sm:min-w-[44px]"
          >
            <X className="size-4" />
          </button>
        </div>
      )}
    </li>
  );
}
