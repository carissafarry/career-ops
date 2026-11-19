import Link from "next/link";
import { readScanRuns, scanLabel } from "@/lib/scan-runs";
import { listScheduledJobs } from "@/lib/scheduled-jobs";
import { scanOwners } from "@/lib/scan-for-run.mjs";
import { locationKeys } from "@/lib/location-geo.mjs";
import { cn } from "@/lib/cn";
import { AutoRefresh } from "@/components/auto-refresh";
import { PageFrame } from "@/components/page-frame";
import { ScanResults } from "@/components/scans/scan-results";

export const dynamic = "force-dynamic"; // always read fresh local files

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export default async function ScansPage({ searchParams }: { searchParams: Promise<{ run?: string | string[]; job?: string | string[] }> }) {
  const params = await searchParams;
  const allRuns = readScanRuns();
  // Which scheduled scan produced each scan; a scan no scheduled run matches was started by hand.
  const store = listScheduledJobs();
  const owners = scanOwners(allRuns, store.runs, store.jobs);
  const jobOptions = [...new Map([...owners.values()].map((o) => [o.jobId, o.name])).entries()].map(([id, name]) => ({ id, name }));
  const isLinkedIn = (id: string) => id.startsWith("linkedin-");
  const hasLinkedIn = allRuns.some((r) => isLinkedIn(r.id));
  const hasManual = allRuns.some((r) => !owners.has(r.id) && !isLinkedIn(r.id));
  const jobFilter = first(params.job);
  const runs = allRuns.filter((r) => {
    // A poll that found nothing is history worth keeping, but ~12 an hour would bury every other scan in "All".
    if (!jobFilter) return !(isLinkedIn(r.id) && r.added === 0);
    if (jobFilter === "linkedin") return isLinkedIn(r.id);
    if (jobFilter === "manual") return !owners.has(r.id) && !isLinkedIn(r.id);
    return owners.get(r.id)?.jobId === jobFilter;
  });
  const wanted = first(params.run);
  const selected = runs.find((r) => r.id === wanted) ?? runs[0];
  const selectedOwner = selected ? owners.get(selected.id) : undefined;
  const filterHref = (job?: string) => (job ? `/scans?job=${encodeURIComponent(job)}` : "/scans");
  // The country each location implies is worked out here, where the city dataset
  // lives, and sent to the filter as plain text.
  const postings = selected
    ? selected.postings.map((p) => ({ ...p, locationKeys: locationKeys(p.location) }))
    : [];

  return (
    <PageFrame width="wide" className="space-y-8">
      <AutoRefresh seconds={10} />
      <div>
        <h1 className="font-display text-3xl text-landing">Scans</h1>
        <p className="mt-2 text-base text-muted">Every scan, and the roles it added. Pick one to see its results.</p>
      </div>

      {allRuns.length > 0 && (jobOptions.length > 0 || hasManual || hasLinkedIn) && (
        <nav aria-label="Filter scans by scheduled scan" className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-faint">From</span>
          {[{ id: "", name: "All" }, ...jobOptions, ...(hasLinkedIn ? [{ id: "linkedin", name: "LinkedIn" }] : []), ...(hasManual ? [{ id: "manual", name: "Run by hand" }] : [])].map((option) => {
            const on = (jobFilter ?? "") === option.id;
            return (
              <Link
                key={option.id || "all"}
                href={filterHref(option.id)}
                aria-current={on ? "page" : undefined}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50",
                  on ? "border-brand/40 bg-brand-soft text-brand-text" : "border-border text-muted hover:text-foreground",
                )}
              >
                {option.name}
              </Link>
            );
          })}
        </nav>
      )}

      {allRuns.length === 0 ? (
        <p className="rounded-2xl border border-border bg-surface px-6 py-8 text-base text-muted shadow-card">
          No scans yet. Run /career-ops scan, then come back.
        </p>
      ) : runs.length === 0 ? (
        <p className="rounded-2xl border border-border bg-surface px-6 py-8 text-base text-muted shadow-card">
          No scans match this filter yet.
        </p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[18rem_1fr]">
          <ul className="space-y-2.5" aria-label="Scan runs">
            {runs.map((run) => {
              const active = run.id === selected?.id;
              return (
                <li key={run.id}>
                  <Link
                    href={`/scans?run=${encodeURIComponent(run.id)}${jobFilter ? `&job=${encodeURIComponent(jobFilter)}` : ""}`}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "block rounded-xl border px-4 py-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50",
                      active
                        ? "border-brand/40 bg-brand-soft"
                        : "border-border bg-surface shadow-card hover:border-brand/30",
                    )}
                  >
                    {owners.get(run.id) && <span className="mb-0.5 block truncate text-xs font-medium text-faint">{owners.get(run.id)!.name}</span>}
                    <span className={cn("block font-semibold", active ? "text-brand-text" : "text-foreground")}>{scanLabel(run)}</span>
                    <span className="mt-0.5 block text-sm text-muted">
                      <span className="font-semibold tabular-nums text-foreground">{run.added}</span> new
                      {isLinkedIn(run.id) && run.found > 0 && (
                        <>
                          {" · "}
                          <span className="tabular-nums">{run.found}</span> read, <span className="tabular-nums">{run.kept ?? 0}</span> match
                        </>
                      )}
                      {run.kind === "filtered" && (
                        <>
                          {" · "}
                          <span className="tabular-nums">{run.found.toLocaleString("en-US")}</span> checked
                        </>
                      )}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>

          {selected && (
            <section aria-label={scanLabel(selected)} className="min-w-0 rounded-2xl border border-border bg-surface p-5 shadow-card sm:p-6">
              <h2 className="text-xl font-bold tracking-[-0.01em] text-landing">{selectedOwner ? `${selectedOwner.name} · ${scanLabel(selected)}` : scanLabel(selected)}</h2>
              <p className="mt-1 text-sm text-muted">
                {selected.id.startsWith("linkedin-")
                  ? `One LinkedIn watcher poll: ${selected.found} jobs read from your saved search, ${selected.kept ?? 0} match your filters, ${selected.added} of them new (${Math.max((selected.kept ?? 0) - selected.added, 0)} already seen in an earlier poll). The first poll lists everything that matches.`
                  : selected.kind === "full"
                  ? "Full ATS sweep across Greenhouse, Lever, Ashby, Workday and more."
                  : `${selected.found.toLocaleString("en-US")} checked, ${selected.filteredTitle.toLocaleString("en-US")} dropped by the title filter, ${selected.dupes.toLocaleString("en-US")} already seen.`}
              </p>
              {postings.length === 0 ? (
                <p className="mt-5 text-base text-muted">This scan added no new roles, or its roles were removed from the history.</p>
              ) : (
                // Keyed by scan so switching scans starts with clear filters.
                <ScanResults key={selected.id} postings={postings} />
              )}
            </section>
          )}
        </div>
      )}
    </PageFrame>
  );
}
