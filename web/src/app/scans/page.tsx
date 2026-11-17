import Link from "next/link";
import { readScanRuns, scanLabel } from "@/lib/scan-runs";
import { locationKeys } from "@/lib/location-geo.mjs";
import { cn } from "@/lib/cn";
import { PageFrame } from "@/components/page-frame";
import { ScanResults } from "@/components/scans/scan-results";

export const dynamic = "force-dynamic"; // always read fresh local files

export default async function ScansPage({ searchParams }: { searchParams: Promise<{ run?: string | string[] }> }) {
  const { run: runParam } = await searchParams;
  const runs = readScanRuns();
  const wanted = Array.isArray(runParam) ? runParam[0] : runParam;
  const selected = runs.find((r) => r.id === wanted) ?? runs[0];
  // The country each location implies is worked out here, where the city dataset
  // lives, and sent to the filter as plain text.
  const postings = selected
    ? selected.postings.map((p) => ({ ...p, locationKeys: locationKeys(p.location) }))
    : [];

  return (
    <PageFrame width="wide" className="space-y-8">
      <div>
        <h1 className="font-display text-3xl text-landing">Scans</h1>
        <p className="mt-2 text-base text-muted">Every scan, and the roles it added. Pick one to see its results.</p>
      </div>

      {runs.length === 0 ? (
        <p className="rounded-2xl border border-border bg-surface px-6 py-8 text-base text-muted shadow-card">
          No scans yet. Run /career-ops scan, then come back.
        </p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[18rem_1fr]">
          <ul className="space-y-2.5" aria-label="Scan runs">
            {runs.map((run) => {
              const active = run.id === selected?.id;
              return (
                <li key={run.id}>
                  <Link
                    href={`/scans?run=${encodeURIComponent(run.id)}`}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "block rounded-xl border px-4 py-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50",
                      active
                        ? "border-brand/40 bg-brand-soft"
                        : "border-border bg-surface shadow-card hover:border-brand/30",
                    )}
                  >
                    <span className={cn("block font-semibold", active ? "text-brand-text" : "text-foreground")}>{scanLabel(run)}</span>
                    <span className="mt-0.5 block text-sm text-muted">
                      <span className="font-semibold tabular-nums text-foreground">{run.added}</span> new
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
              <h2 className="text-xl font-bold tracking-[-0.01em] text-landing">{scanLabel(selected)}</h2>
              <p className="mt-1 text-sm text-muted">
                {selected.kind === "full"
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
