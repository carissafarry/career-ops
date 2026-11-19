import type { InboxJob } from "@/lib/career-ops";
import { scorePosting } from "@/lib/core/inbox-rank.mjs";
import { applyInboxFit, loadFitTargets } from "@/lib/inbox-fit-profile.mjs";
import { pendingInbox } from "@/lib/inbox-pending.mjs";
import { readScanRuns, scanSelectorData } from "@/lib/scan-runs";
import { locationKeys } from "@/lib/location-geo.mjs";
import path from "node:path";
import { careerOpsRoot } from "@/lib/career-ops";
import { readPosted, withPostedExact } from "@/lib/linkedin-watch/posted-log.mjs";

export type InboxPayload = {
  jobs: InboxJob[];
  error: string | null;
  scans: { summaries: ReturnType<typeof scanSelectorData>["summaries"]; byUrl: Record<string, string> };
};

/**
 * What the Inbox tab shows: the pending postings with their fit and country keys,
 * and the scan selector data. One definition for the page render and for the
 * /api/pipeline/inbox call that fills the client's copy while another tab is open.
 */
export function loadInboxPayload(inbox: InboxJob[]): InboxPayload {
  const pending = pendingInbox(inbox);
  const fitted = applyInboxFit(
    pending.map((job) => ({ ...job, locationKeys: locationKeys(job.location ?? "") })),
    loadFitTargets,
    (job, targets) => ({
      ...job,
      fit: scorePosting({
        title: job.role,
        location: job.location ?? "",
        pay: job.compensation ?? "",
        rankStamp: job.rankStamp ?? null,
      }, targets),
    }),
  );
  // Jobs added from the LinkedIn watcher keep the hour LinkedIn gave them (the pipeline file itself stores a date only).
  const posted = readPosted(path.join(careerOpsRoot(), "data", "linkedin-posted.tsv"));
  return { jobs: withPostedExact(fitted.jobs, posted), error: fitted.error, scans: scanSelectorData(readScanRuns(), pending.map((job) => job.url)) };
}
