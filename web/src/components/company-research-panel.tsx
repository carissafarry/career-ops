"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Building2, ChevronDown, Loader2, RotateCcw, TriangleAlert } from "lucide-react";
import { useJobs } from "@/components/jobs/job-store";
import { btn, btnBusy } from "@/lib/action-styles";
import { ReportMarkdown } from "@/components/report-markdown";

function useCompanyJob(n: string) {
  const { jobs, startJob } = useJobs();
  const router = useRouter();
  useEffect(() => {
    const onDone = (event: Event) => {
      const d = event instanceof CustomEvent ? event.detail : null;
      if (d?.kind === "company" && d.input === n) router.refresh();
    };
    window.addEventListener("co-job-done", onDone);
    return () => window.removeEventListener("co-job-done", onDone);
  }, [n, router]);
  const job = useMemo(
    () => jobs.filter((j) => j.kind === "company" && j.input === n).sort((a, b) => b.startedAt - a.startedAt)[0],
    [jobs, n],
  );
  return { job, start: (company: string) => startJob({ title: `Company · ${company}`, subtitle: "culture, reviews and pay", kind: "company", input: n, page: `/pipeline/${n}` }) };
}

// The "Evaluate company" action: sends an agent to research the employer
// (culture, employee reviews, pay). The saved report shows below on this page.
export function EvaluateCompanyButton({ n, company, hasResearch }: { n: string; company: string; hasResearch: boolean }) {
  const { job, start } = useCompanyJob(n);
  if (job?.status === "running")
    return (
      <Link href={`/jobs/${job.id}`} className={btnBusy}>
        <Loader2 className="size-3.5 animate-spin" /> Evaluating company…
      </Link>
    );
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button onClick={() => start(company)} className={btn} title="Research the company: culture, employee reviews, pay">
        {hasResearch ? <RotateCcw className="size-3.5" /> : <Building2 className="size-3.5" />}
        {hasResearch ? "Evaluate company again" : "Evaluate company"}
      </button>
      {job?.status === "error" && (
        <Link href={`/jobs/${job.id}`} role="alert" title="Open the run log" className="inline-flex items-center gap-1 text-xs text-red-700 hover:underline dark:text-red-400">
          <TriangleAlert className="size-3.5 shrink-0" /> Company research failed
        </Link>
      )}
    </span>
  );
}

const openKey = (n: string) => `career-ops:company-research-open:${n}`;

// The saved report can be long, so it folds down to its title bar. The choice is
// remembered per application in this browser.
export function CompanyResearchPanel({ n, company, markdown, at }: { n: string; company: string; markdown: string; at: string }) {
  const [open, setOpen] = useState(true);
  useEffect(() => {
    try {
      if (localStorage.getItem(openKey(n)) === "0") setOpen(false);
    } catch {
      /* storage can be blocked; stay open */
    }
  }, [n]);
  const toggle = () => {
    const next = !open;
    setOpen(next);
    try {
      localStorage.setItem(openKey(n), next ? "1" : "0");
    } catch {
      /* the fold still works for this visit */
    }
  };
  const when = new Date(at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  return (
    <section aria-label="Company research" className="mt-5 rounded-2xl border border-border bg-surface/60 print:hidden">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-controls={`company-research-${n}`}
        className="flex w-full items-center gap-2 rounded-2xl px-4 py-3 text-left hover:bg-surface-hover max-sm:min-h-[44px]"
      >
        <h2 className="font-display text-lg leading-tight text-foreground">Company research</h2>
        <span className="min-w-0 flex-1 truncate text-xs text-faint">{company} · {when}</span>
        <span className="shrink-0 text-xs text-muted">{open ? "Minimize" : "Show"}</span>
        <ChevronDown className={`size-4 shrink-0 text-faint transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div id={`company-research-${n}`} className="border-t border-border px-4 pb-4">
          <p className="mt-3 text-xs text-faint">
            Written by an agent from public pages. Review sites are anecdotes, not proof, and pay figures can be out of date. Check the sources before relying on it.
          </p>
          <article className="report-prose mt-3">
            <ReportMarkdown>{markdown}</ReportMarkdown>
          </article>
        </div>
      )}
    </section>
  );
}
