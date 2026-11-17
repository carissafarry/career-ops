"use client";

import { useMemo, useState } from "react";
import type { AtsSource } from "@/lib/explore";
import { ATS_SOURCES } from "@/lib/explore";
import { SENIORITY_ORDER, daysSince, seniorityFromTitle, sourceFromUrl, type Seniority } from "@/lib/inbox";
import { locationMatches } from "@/lib/location-facet.mjs";
import { FacetChips } from "@/components/inbox/facet-chips";

export type ScanResultRow = {
  url: string;
  company: string;
  role: string;
  location: string;
  /** Lowercase search text for the location box, built on the server. */
  locationKeys: string;
  postedAt?: string;
  firstSeen?: string;
};

// A long scan (the full sweep can list about a thousand roles) shows this many rows
// first, so the page stays quick. "Show all" lifts it.
const ROW_LIMIT = 200;

/**
 * The roles one scan found, with the same filters as the Pipeline inbox: company or
 * role text, how recent, platform, level, and location or country.
 */
export function ScanResults({ postings }: { postings: ScanResultRow[] }) {
  const [within, setWithin] = useState<number | null>(null);
  const [sources, setSources] = useState<Set<AtsSource>>(() => new Set());
  const [seniorities, setSeniorities] = useState<Set<Seniority>>(() => new Set());
  const [locQ, setLocQ] = useState("");
  const [kw, setKw] = useState("");
  const [showAll, setShowAll] = useState(false);
  const now = useMemo(() => Date.now(), []);

  const enriched = useMemo(
    () =>
      postings.map((posting) => ({
        posting,
        source: sourceFromUrl(posting.url),
        seniority: seniorityFromTitle(posting.role),
        age: daysSince(posting.postedAt || posting.firstSeen, now),
      })),
    [postings, now],
  );

  const availSources = useMemo(() => {
    const present = new Set<AtsSource>();
    for (const e of enriched) if (e.source) present.add(e.source);
    return ATS_SOURCES.filter((s) => present.has(s));
  }, [enriched]);
  const availSeniorities = useMemo(() => {
    const present = new Set<Seniority>();
    for (const e of enriched) if (e.seniority) present.add(e.seniority);
    return SENIORITY_ORDER.filter((s) => present.has(s));
  }, [enriched]);

  const filtered = useMemo(
    () =>
      enriched.filter((e) => {
        if (within != null && (e.age == null || e.age > within)) return false;
        if (sources.size && (!e.source || !sources.has(e.source))) return false;
        if (seniorities.size && (!e.seniority || !seniorities.has(e.seniority))) return false;
        if (locQ.trim() && !locationMatches(e.posting.locationKeys || e.posting.location, locQ)) return false;
        if (kw.trim() && !`${e.posting.company} ${e.posting.role}`.toLowerCase().includes(kw.trim().toLowerCase())) return false;
        return true;
      }),
    [enriched, within, sources, seniorities, locQ, kw],
  );

  const anyActive = within != null || sources.size > 0 || seniorities.size > 0 || locQ.trim() !== "" || kw.trim() !== "";
  const shown = showAll ? filtered : filtered.slice(0, ROW_LIMIT);
  const hasPosted = postings.some((p) => p.postedAt);

  return (
    <div className="mt-5 space-y-4">
      <FacetChips
        within={within}
        setWithin={setWithin}
        sources={sources}
        toggleSource={(s) => setSources((set) => { const next = new Set(set); if (next.has(s)) next.delete(s); else next.add(s); return next; })}
        seniorities={seniorities}
        toggleSeniority={(s) => setSeniorities((set) => { const next = new Set(set); if (next.has(s)) next.delete(s); else next.add(s); return next; })}
        locQ={locQ}
        setLocQ={setLocQ}
        kw={kw}
        setKw={setKw}
        availSources={availSources}
        availSeniorities={availSeniorities}
        resultCount={filtered.length}
        totalCount={enriched.length}
        anyActive={anyActive}
        onClear={() => { setWithin(null); setSources(new Set()); setSeniorities(new Set()); setLocQ(""); setKw(""); }}
      />

      {filtered.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-6 py-8 text-center text-base text-muted">
          No matches. Loosen the filters to see more of this scan.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[40rem] text-left text-sm">
            <thead className="bg-surface-hover text-sm text-muted">
              <tr>
                <th className="px-4 py-3 font-semibold">Company</th>
                <th className="px-4 py-3 font-semibold">Role</th>
                <th className="px-4 py-3 font-semibold">Location</th>
                {hasPosted && <th className="px-4 py-3 font-semibold">Posted</th>}
              </tr>
            </thead>
            <tbody>
              {shown.map(({ posting: p }) => (
                <tr key={p.url} className="border-t border-border align-top transition-colors hover:bg-surface-hover/60">
                  <td className="px-4 py-3.5 font-semibold text-foreground">{p.company || "—"}</td>
                  <td className="px-4 py-3.5">
                    <a href={p.url} target="_blank" rel="noreferrer" className="text-foreground hover:text-brand-text hover:underline">
                      {p.role || p.url}
                    </a>
                  </td>
                  <td className="px-4 py-3.5 text-muted">{p.location || "—"}</td>
                  {hasPosted && <td className="whitespace-nowrap px-4 py-3.5 tabular-nums text-muted">{p.postedAt || "—"}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {filtered.length > ROW_LIMIT && (
        <p className="text-sm text-muted">
          {showAll ? (
            <>
              Showing all {filtered.length.toLocaleString("en-US")} roles.{" "}
              <button type="button" onClick={() => setShowAll(false)} className="font-semibold text-brand-text hover:underline">
                Show the first {ROW_LIMIT}
              </button>
            </>
          ) : (
            <>
              Showing the first {ROW_LIMIT} of {filtered.length.toLocaleString("en-US")} roles.{" "}
              <button type="button" onClick={() => setShowAll(true)} className="font-semibold text-brand-text hover:underline">
                Show all
              </button>
            </>
          )}
        </p>
      )}
    </div>
  );
}
