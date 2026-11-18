"use client";

import { useEffect, useMemo } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FileDown, Loader2, FileText, RotateCcw, SlidersHorizontal, TriangleAlert } from "lucide-react";
import { useJobs } from "@/components/jobs/job-store";
import { btn, btnBusy, btnDone, btnPrimary } from "@/lib/action-styles";
import { CvPdfFileActions } from "@/components/cv-pdf-file-actions";
import { pdfButtonState, pdfJobRefreshesReport, type PdfFailure } from "@/lib/pdf-button-state.mjs";
import { pipelineQuery } from "@/lib/pipeline-navigation.mjs";

function useListQuery() {
  const listQuery = pipelineQuery(useSearchParams().toString());
  return listQuery ? `?${listQuery}` : "";
}

// Fires the real career-ops `pdf` mode (worker kind "pdf") to generate an
// ATS-optimized CV tailored to THIS offer → output/cv-… + marks the tracker.
// Only the generating action lives here. The finished file's actions (view,
// download, customize) are in CvFileActions, on their own row.
export function GeneratePdfButton({ n, company, onDisk }: { n: string; company: string; onDisk: boolean }) {
  const { jobs, startJob } = useJobs();
  const router = useRouter();
  const jobQuery = useListQuery();
  useEffect(() => {
    const onDone = (event: Event) => {
      const detail = event instanceof CustomEvent ? event.detail : null;
      if (pdfJobRefreshesReport(detail, n)) router.refresh();
    };
    window.addEventListener("co-job-done", onDone);
    return () => window.removeEventListener("co-job-done", onDone);
  }, [n, router]);
  const job = useMemo(
    () => jobs.filter((j) => j.kind === "pdf" && j.input === n).sort((a, b) => b.startedAt - a.startedAt)[0],
    [jobs, n],
  );
  const generate = () =>
    startJob({ title: `CV PDF · ${company}`, subtitle: "tailored for this role", kind: "pdf", input: n, page: `/pipeline/${n}` });

  const state = pdfButtonState(job, onDisk);

  if (state.kind === "running")
    return (
      <Link href={`/jobs/${state.jobId}${jobQuery}`} className={btnBusy}>
        <Loader2 className="size-3.5 animate-spin" /> Generating CV…
      </Link>
    );

  const ready = state.kind === "ready";
  return (
    <>
      <button
        onClick={generate}
        className={ready ? btn : btnPrimary}
        title={
          ready
            ? "Generate the tailored CV again. Your notes are used if you wrote any."
            : "Generate an ATS-optimized CV tailored to this role. Your notes are used if you wrote any."
        }
      >
        {ready ? <RotateCcw className="size-3.5" /> : <FileDown className="size-3.5" />}
        {ready ? "Regenerate CV" : "Generate tailored CV (PDF)"}
      </button>
      <FailureNote failure={state.failure} jobQuery={jobQuery} />
    </>
  );
}

// The finished CV file: open it, save it, reveal it, or edit it in the studio.
// Renders nothing until a file exists.
export function CvFileActions({ n, company, onDisk }: { n: string; company: string; onDisk: boolean }) {
  const jobQuery = useListQuery();
  if (!onDisk) return null;
  const studioHref = `/pipeline/${encodeURIComponent(n)}/cv-studio${jobQuery}`;
  const viewHref = `/api/cv-pdf?n=${encodeURIComponent(n)}&company=${encodeURIComponent(company)}`;
  return (
    <>
      <a href={viewHref} target="_blank" rel="noreferrer" className={btnDone}>
        <FileText className="size-3.5" /> View tailored CV
      </a>
      <CvPdfFileActions viewHref={viewHref} className={btn} />
      <Link href={studioHref} className={btn}>
        <SlidersHorizontal className="size-3.5" /> Review and customize
      </Link>
    </>
  );
}

function FailureNote({ failure, jobQuery }: { failure: PdfFailure; jobQuery: string }) {
  if (!failure) return null;
  return (
    <Link
      href={`/jobs/${failure.jobId}${jobQuery}`}
      role="alert"
      title="Open the run log"
      className="inline-flex w-full max-w-2xl items-start gap-1 text-xs text-red-700 hover:underline dark:text-red-400"
    >
      <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
      <span>CV not generated. {failure.reason}</span>
    </Link>
  );
}
