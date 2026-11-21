"use client";

import { use } from "react";
import ReactMarkdown from "react-markdown";
import { markdownLinks } from "@/components/markdown-link";
import remarkGfm from "remark-gfm";
import { noMarkdownImages } from "@/lib/markdown-options.mjs";
import { ArrowLeft, Loader2, Wrench, CircleDot, Check, X, CirclePause } from "lucide-react";
import { evaluationGateForJob, isLegacyMissingReportMessage, jobOutputForDisplay } from "@/lib/job-gate.mjs";
import { notFound, useSearchParams } from "next/navigation";
import { useJobs } from "@/components/jobs/job-store";
import { missingWorker } from "@/lib/job-route.mjs";
import JobLoading from "./loading";
import { BackLink } from "@/components/back-link";
import { pipelineQuery } from "@/lib/pipeline-navigation.mjs";
import { HeroGlow } from "@/components/hero-glow";
import { Badge } from "@/components/ui/badge";
import { CoverAnswers } from "@/components/jobs/cover-answers";

export default function JobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { jobs, ready } = useJobs();
  const job = jobs.find((j) => j.id === id);
  const query = pipelineQuery(useSearchParams().toString());
  // Back goes to the page the run was started from (for example the evaluation
  // /pipeline/2), not always the list. Runs saved before this was tracked fall back to the list.
  const origin = job?.page && /^\/(?!\/)/.test(job.page) ? job.page : "/pipeline";
  const pipelineHref = `${origin}${query && origin.startsWith("/pipeline") ? `?${query}` : ""}`;
  const backLabel = /^\/pipeline\/(\d+)/.exec(origin) ? `Evaluation #${/^\/pipeline\/(\d+)/.exec(origin)?.[1]}` : origin.startsWith("/explore") ? "Explore" : "Pipeline";

  if (!ready) return <JobLoading />;
  if (missingWorker({ ready, ids: jobs.map((j) => j.id), id })) notFound();
  if (!job) notFound();

  const gate = evaluationGateForJob(job);
  const displayOutput = jobOutputForDisplay(job);
  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <BackLink href={pipelineHref} className="inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-brand-text">
        <ArrowLeft className="size-4" /> {backLabel}
      </BackLink>

      <section className="dot-bg relative mt-5 overflow-hidden rounded-2xl border border-border bg-surface shadow-card px-6 py-7">
        {job.status === "running" && <HeroGlow />}
        <div className="relative z-10">
          <p className="flex items-center gap-2 font-mono text-xs tracking-[0.01em] text-faint">
            {job.status === "running" ? (
              <><Loader2 className="size-3 animate-spin text-brand-text" /> working</>
            ) : gate || job.status === "gated" ? (
              <><CirclePause className="size-3 text-amber-500" /> needs review</>
            ) : job.status === "done" ? (
              <><Check className="size-3 text-emerald-500" /> done</>
            ) : (
              <><X className="size-3 text-red-400" /> error</>
            )}
          </p>
          <h1 className="mt-2 font-display text-2xl tracking-tight text-landing">{job.title}</h1>
          {job.subtitle && <p className="mt-1 text-sm text-muted">{job.subtitle}</p>}
          {job.status === "done" && job.result?.score != null && (
            <div className="mt-3 flex flex-wrap items-center gap-2.5">
              <Badge tone={job.result.tone}>{job.result.score}/5</Badge>
              {job.result.summary && <span className="text-sm text-muted">{job.result.summary}</span>}
            </div>
          )}
        </div>
      </section>

      {gate && (
        <section aria-label="Evaluation needs review" className="mt-5 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-5">
          <h2 className="font-medium text-foreground">{gate.confirmationRequired ? "Review your conditions before continuing" : "Evaluation stopped by your conditions"}</h2>
          <p className="mt-2 text-sm text-muted">{gate.message}</p>
          <p className="mt-2 text-sm text-muted">
            {gate.legacy ? "The saved output records an evaluation stop. The earlier run's process exit could not be verified; its technical details are kept below." : "No score or evaluation report was created. Your conditions were kept."}
          </p>
          <button type="button" onClick={() => window.dispatchEvent(new CustomEvent("co-assistant"))} className="mt-3 rounded-md border border-border bg-surface px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-surface-hover">
            Open assistant to review
          </button>
          {gate.legacy && (
            <details className="mt-3 text-sm text-muted">
              <summary className="cursor-pointer font-medium">Earlier run details</summary>
              <p className="mt-2 break-words">{job.steps.at(-1)?.label}</p>
            </details>
          )}
        </section>
      )}

      <ol className="mt-6 space-y-2">
        {job.steps.map((s, i) => (
          <li key={i} className="flex items-start gap-2.5 text-sm">
            {s.kind === "tool" ? (
              <Wrench className="mt-0.5 size-3.5 shrink-0 text-brand-text" />
            ) : (
              <CircleDot className="mt-0.5 size-3.5 shrink-0 text-faint" />
            )}
            <span className={s.kind === "tool" ? "font-medium" : "text-muted"}>
              {gate?.legacy && isLegacyMissingReportMessage(s.label)
                ? "Earlier run returned no report. Review the recorded stop and technical details above."
                : s.kind === "tool" ? `Using ${s.label}` : s.label}
            </span>
          </li>
        ))}
        {job.status === "running" && (
          <li className="flex items-center gap-2.5 text-sm text-muted">
            <Loader2 className="size-3.5 animate-spin text-brand-text" /> thinking…
          </li>
        )}
      </ol>

      {job.kind === "cover" && <CoverAnswers brief={job.brief} />}

      {job.text && (
        <div className="mt-8">
          <h2 className="text-xs font-semibold tracking-[0.01em] text-muted">Output</h2>
          <div className="report-prose mt-3 rounded-2xl border border-border bg-surface shadow-card p-5">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownLinks} {...noMarkdownImages}>{displayOutput}</ReactMarkdown>
          </div>
          {displayOutput !== job.text && (
            <details className="mt-3 text-sm text-muted">
              <summary className="cursor-pointer font-medium">Raw worker output</summary>
              <pre className="mt-2 whitespace-pre-wrap break-words rounded-lg border border-border p-3 text-xs">{job.text}</pre>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
