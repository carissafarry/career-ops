import Link from "next/link";
import { readScanRuns, scanLabel } from "@/lib/scan-runs";
import { cn } from "@/lib/cn";
import { PageFrame } from "@/components/page-frame";

export const dynamic = "force-dynamic"; // always read fresh local files

export default async function ScansPage({ searchParams }: { searchParams: Promise<{ run?: string | string[] }> }) {
  const { run: runParam } = await searchParams;
  const runs = readScanRuns();
  const wanted = Array.isArray(runParam) ? runParam[0] : runParam;
  const selected = runs.find((r) => r.id === wanted) ?? runs[0];

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
              {selected.postings.length === 0 ? (
                <p className="mt-5 text-base text-muted">This scan added no new roles, or its roles were removed from the history.</p>
              ) : (
                <div className="mt-5 overflow-x-auto rounded-xl border border-border">
                  <table className="w-full min-w-[40rem] text-left text-sm">
                    <thead className="bg-surface-hover text-sm text-muted">
                      <tr>
                        <th className="px-4 py-3 font-semibold">Company</th>
                        <th className="px-4 py-3 font-semibold">Role</th>
                        <th className="px-4 py-3 font-semibold">Location</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selected.postings.map((p) => (
                        <tr key={p.url} className="border-t border-border align-top transition-colors hover:bg-surface-hover/60">
                          <td className="px-4 py-3.5 font-semibold text-foreground">{p.company || "—"}</td>
                          <td className="px-4 py-3.5">
                            <a href={p.url} target="_blank" rel="noreferrer" className="text-foreground hover:text-brand-text hover:underline">
                              {p.role || p.url}
                            </a>
                          </td>
                          <td className="px-4 py-3.5 text-muted">{p.location || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}
        </div>
      )}
    </PageFrame>
  );
}
