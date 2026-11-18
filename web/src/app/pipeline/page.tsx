import { Suspense } from "react";
import { pdfReadyReportNumbers, pipelineSummary, readTrackerShape, withCloseDates } from "@/lib/career-ops";
import { reportNumberFromCell } from "@/lib/apply/cv-selection.mjs";
import { pendingInbox } from "@/lib/inbox-pending.mjs";
import { PipelineView } from "@/components/pipeline-view";
import { pipelineTab } from "@/lib/pipeline-navigation.mjs";
import { loadInboxPayload } from "@/lib/inbox-payload";

export const dynamic = "force-dynamic"; // always read fresh local files

// Tracker tabs show the inbox only as a count, so they get the count and not
// the postings. The inbox is most of the page payload on a large pipeline.
export default async function PipelinePage({ searchParams }: { searchParams: Promise<{ tab?: string | string[] }> }) {
  const { tab } = await searchParams;
  const onInbox = pipelineTab(tab) === "INBOX";
  const summary = pipelineSummary();
  const applications = await withCloseDates(summary.applications);
  const { inbox } = summary;
  const pending = pendingInbox(inbox);
  const inboxPayload = onInbox ? loadInboxPayload(inbox) : null;
  const trackerShape = readTrackerShape();
  // Tracker row numbers whose tailored CV is indexed (data/pdf-index.tsv) AND on
  // disk; the tracker's own PDF emoji can drift from what output/ really holds.
  // Rows are keyed the way /api/cv-pdf?application= resolves them: through the
  // report cell, so a row with no resolvable report never gets a dead link.
  // Computed on every tab, the inbox too: the client switches between tabs
  // without asking the server again, so the rows have to carry their PDF links.
  // One manifest read for the whole table, not one per row (#6974: per-row
  // lookups took 8 s on a 5,000-row tracker).
  const cvRows: string[] = [];
  const rowReports = applications.flatMap((a) => {
    const report = reportNumberFromCell(a.report);
    return report !== null && report > 0 ? [{ n: a.n, report }] : [];
  });
  const ready = await pdfReadyReportNumbers(new Set(rowReports.map((r) => r.report)));
  for (const r of rowReports) if (ready.has(r.report)) cvRows.push(r.n);
  return (
    <Suspense>
      <PipelineView
        applications={applications}
        inbox={inboxPayload ? inboxPayload.jobs : null}
        inboxCount={pending.length}
        inboxFitError={inboxPayload?.error ?? null}
        scans={inboxPayload ? inboxPayload.scans : null}
        trackerShape={trackerShape}
        cvRows={cvRows}
      />
    </Suspense>
  );
}
