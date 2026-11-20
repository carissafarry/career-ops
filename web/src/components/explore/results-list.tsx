"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, ArrowUpDown, ChevronDown, Check, LayoutGrid, List } from "lucide-react";
import { cn } from "@/lib/cn";
import type { DiscoveredOffer } from "@/lib/explore";
import { SENIORITY_ORDER, daysSince, seniorityFromTitle, sourceFromUrl, type PlatformSource, type Seniority } from "@/lib/inbox";
import { PLATFORM_ORDER } from "@/lib/platform-sources";
import { locationExcluded, locationMatchesAny } from "@/lib/location-facet.mjs";
import { FacetChips } from "@/components/inbox/facet-chips";
import { RemovedBar } from "./removed-bar";
import { useSourceFilter } from "@/lib/source-exclusions";
import { CHINA_SOURCES } from "@/lib/employer-preset.mjs";
import {
  DEFAULT_SORT,
  FIT_BANDS,
  SORT_LABELS,
  applyResultsView,
  availableSortKeys,
  countBands,
  dirLabel,
  flipSortDir,
  normalizeSort,
  sortSummary,
  toggleBand,
  toggleSortKey,
  type FitBand,
  type SortSpec,
} from "@/lib/results-view.mjs";
import { CostBadge } from "@/components/cost/cost-badge";
import { DiscoveryCard } from "./discovery-card";
import { useExplore } from "./explore-provider";

export type EnrichedOffer = DiscoveredOffer & { inPipeline: boolean; evaluatedN?: string };

type Layout = "grid" | "list";

const segmented = "inline-flex rounded-lg border border-border bg-surface p-0.5 text-xs";
const segmentOn = "bg-brand-soft text-brand-text";
const segmentOff = "text-muted hover:text-foreground";

export function ResultsList({ offers }: { offers: EnrichedOffer[] }) {
  const { companiesScanned, partial, error, addToPipeline, added, removed, mode, running } = useExplore();
  const isAi = mode === "ai";
  const employer = offers.some(o => CHINA_SOURCES.includes(o.source));
  const [q, setQ] = useState("");
  const [sortSpec, setSortSpec] = useState<SortSpec[]>(() => [...DEFAULT_SORT]);
  const [hiddenBands, setHiddenBands] = useState<ReadonlySet<FitBand>>(() => new Set());
  const [layout, setLayout] = useState<Layout>("grid");
  const [sortOpen, setSortOpen] = useState(false);
  const sortRef = useRef<HTMLDivElement>(null);
  const sortTriggerRef = useRef<HTMLButtonElement>(null);

  // Same facets as the Pipeline inbox: how recent, platform, level, location or country.
  // Roles already in the pipeline are hidden unless the user asks to include them.
  const [within, setWithin] = useState<number | null>(null);
  const [sources, setSources] = useState<Set<PlatformSource>>(() => new Set());
  const [seniorities, setSeniorities] = useState<Set<Seniority>>(() => new Set());
  const [locQ, setLocQ] = useState("");
  const [locNot, setLocNot] = useState("");
  // Roles already in the pipeline are shown by default; the button hides them.
  const [includePipeline, setIncludePipeline] = useState(true);
  const now = useMemo(() => Date.now(), []);
  const tagged = useMemo(
    () => offers.map((offer) => ({ offer, source: sourceFromUrl(offer.url), seniority: seniorityFromTitle(offer.title), age: daysSince(offer.postedAt, now) })),
    [offers, now],
  );
  const inPipelineCount = useMemo(() => offers.filter((o) => o.inPipeline).length, [offers]);
  const availSources = useMemo(() => {
    const present = new Set<PlatformSource>();
    for (const t of tagged) if (t.source) present.add(t.source);
    return PLATFORM_ORDER.filter((s) => present.has(s));
  }, [tagged]);
  const availSeniorities = useMemo(() => {
    const present = new Set<Seniority>();
    for (const t of tagged) if (t.seniority) present.add(t.seniority);
    return SENIORITY_ORDER.filter((s) => present.has(s));
  }, [tagged]);
  const { isHidden } = useSourceFilter("explore");
  const facetFiltered = useMemo(
    () =>
      tagged
        .filter((t) => {
          if (isHidden(t.offer.url)) return false;
          // Taken out of the pipeline: gone from the list (the bar below can undo it).
          if (removed.has(t.offer.url)) return false;
          if (!includePipeline && t.offer.inPipeline) return false;
          if (within != null && (t.age == null || t.age > within)) return false;
          if (sources.size && (!t.source || !sources.has(t.source))) return false;
          if (seniorities.size && (!t.seniority || !seniorities.has(t.seniority))) return false;
          if (locQ.trim() && !locationMatchesAny(t.offer.locationKeys || t.offer.location || "", locQ)) return false;
          if (locationExcluded(t.offer.locationKeys || t.offer.location || "", locNot)) return false;
          return true;
        })
        .map((t) => t.offer),
    [tagged, isHidden, removed, includePipeline, within, sources, seniorities, locQ, locNot],
  );
  const facetActive = within != null || sources.size > 0 || seniorities.size > 0 || locQ.trim() !== "" || locNot.trim() !== "";

  // Fit bands are free title-vs-profile estimates on scan offers only; the fit
  // controls stay out of the way when nothing in this result set carries one.
  const bandCounts = useMemo(() => countBands(offers), [offers]);
  const hasFit = FIT_BANDS.some((b) => bandCounts[b] > 0);
  const sortKeys = useMemo(() => availableSortKeys(offers), [offers]);
  // A choice made earlier (e.g. Fit) falls back when a later run has nothing to apply it to.
  const sort = useMemo(() => normalizeSort(sortSpec, sortKeys), [sortSpec, sortKeys]);

  const view = useMemo(() => applyResultsView(facetFiltered, { query: q, hiddenBands, sort }), [facetFiltered, q, hiddenBands, sort]);

  // "Add all" acts on what is on screen, so a filter can't bulk-add rows the user can't see.
  const addable = view.filter((o) => !o.inPipeline && !o.evaluatedN && !added.has(o.url));

  useEffect(() => {
    if (!sortOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      if (!sortRef.current?.contains(e.target as Node)) setSortOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setSortOpen(false);
      // Closing the menu from the keyboard puts focus back on the button that opened it.
      sortTriggerRef.current?.focus();
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [sortOpen]);

  return (
    <div className="space-y-4">
      <FacetChips
        sourceScope="explore"
        within={within}
        setWithin={setWithin}
        sources={sources}
        toggleSource={(s) => setSources((set) => { const next = new Set(set); if (next.has(s)) next.delete(s); else next.add(s); return next; })}
        seniorities={seniorities}
        toggleSeniority={(s) => setSeniorities((set) => { const next = new Set(set); if (next.has(s)) next.delete(s); else next.add(s); return next; })}
        locQ={locQ}
        setLocQ={setLocQ}
        locNot={locNot}
        setLocNot={setLocNot}
        kw={q}
        setKw={setQ}
        availSources={availSources}
        availSeniorities={availSeniorities}
        allUrls={offers.map((o) => o.url)}
        resultCount={view.length}
        totalCount={tagged.filter((t) => !isHidden(t.offer.url) && !removed.has(t.offer.url) && (includePipeline || !t.offer.inPipeline)).length}
        anyActive={facetActive || q.trim() !== ""}
        onClear={() => { setWithin(null); setSources(new Set()); setSeniorities(new Set()); setLocQ(""); setLocNot(""); setQ(""); }}
      />

      <div className="flex flex-wrap items-center gap-3">
        <div>
          <p className="text-sm text-foreground">
            <span className="font-semibold">{offers.length}</span> {isAi ? `candidate${offers.length === 1 ? "" : "s"}` : employer ? `match${offers.length === 1 ? "" : "es"}` : `fresh role${offers.length === 1 ? "" : "s"}`}
            {view.length !== offers.length && <span className="text-faint"> · {view.length} shown</span>}
            <CostBadge kind={isAi ? "spend" : "free-network"} size="xs" className="ml-2 align-middle" />
          </p>
          <p className="text-xs text-faint">
            {isAi
              ? "found by AI on the open web · unverified until you evaluate"
              : employer ? "From selected employer sites · check the original JD · 0 tokens spent" : `${companiesScanned > 0 ? `${companiesScanned.toLocaleString()} companies scanned · ` : ""}0 tokens spent${partial ? " · some boards were unreachable (normal for public directories)" : ""}`}
          </p>
          {!isAi && error && <p className="text-xs text-amber-800 dark:text-amber-300">{error}</p>}
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {inPipelineCount > 0 && (
            <button
              type="button"
              aria-pressed={includePipeline}
              onClick={() => setIncludePipeline((v) => !v)}
              title={includePipeline ? "Hide the roles that are already in your pipeline" : "Also show the roles that are already in your pipeline"}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors",
                includePipeline ? "border-brand/40 bg-brand-soft text-brand-text" : "border-border bg-surface text-muted hover:text-foreground",
              )}
            >
              {includePipeline && <Check className="size-3.5" strokeWidth={3} />}
              {includePipeline ? `Including ${inPipelineCount} already in pipeline` : `Show ${inPipelineCount} already in pipeline`}
            </button>
          )}

          {hasFit && (
            <div role="group" aria-label="Filter by fit" className={segmented}>
              {FIT_BANDS.map((b) => {
                const on = !hiddenBands.has(b);
                return (
                  <button
                    key={b}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setHiddenBands((h) => toggleBand(h, b))}
                    title={on ? `Hide ${b}-fit results` : `Show ${b}-fit results`}
                    className={cn("rounded-md px-2.5 py-1 font-medium capitalize transition-colors", on ? segmentOn : cn(segmentOff, "text-faint line-through"))}
                  >
                    {b} <span className="tabular-nums text-faint">{bandCounts[b]}</span>
                  </button>
                );
              })}
            </div>
          )}

          <div ref={sortRef} className="relative">
            <button
              ref={sortTriggerRef}
              type="button"
              aria-haspopup="true"
              aria-expanded={sortOpen}
              onClick={() => setSortOpen((o) => !o)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-brand-soft hover:text-brand-text"
            >
              <ArrowUpDown className="size-3.5 text-faint" />
              Sort: {sortSummary(sort)}
              <ChevronDown className="size-3.5 text-faint" />
            </button>
            {sortOpen && (
              <div role="group" aria-label="Sort by" className="absolute right-0 top-full z-20 mt-1 w-72 rounded-xl border border-border bg-surface p-1.5 shadow-xl">
                <p className="px-2 pb-2 pt-1 text-xs leading-snug text-muted">Pick one or more. The order you pick is the priority. Use the chip to flip direction.</p>
                {sortKeys.map((key) => {
                  const idx = sort.findIndex((s) => s.key === key);
                  const on = idx >= 0;
                  const locked = on && sort.length === 1;
                  return (
                    <div key={key} className="flex items-center gap-2 px-1 py-0.5">
                      <button
                        type="button"
                        aria-pressed={on}
                        aria-disabled={locked || undefined}
                        title={locked ? "At least one sort stays on" : undefined}
                        onClick={() => setSortSpec(toggleSortKey(sort, key))}
                        className="flex flex-1 items-center gap-2.5 rounded-md px-1.5 py-1.5 text-left text-[14px] text-foreground transition-colors hover:bg-surface-hover"
                      >
                        <span className={cn("grid size-4 shrink-0 place-items-center rounded border", on ? "border-brand bg-brand text-white" : "border-border")}>
                          {on && <Check className="size-3" strokeWidth={3} />}
                        </span>
                        {SORT_LABELS[key]}
                        {on && <span className="ml-1 text-xs font-semibold tabular-nums text-brand-text">{idx + 1}</span>}
                      </button>
                      {on && (
                        <button
                          type="button"
                          aria-label={`${SORT_LABELS[key]}: ${dirLabel(key, sort[idx].dir)}. Flip direction`}
                          onClick={() => setSortSpec(flipSortDir(sort, key))}
                          className="inline-flex items-center gap-1 rounded-md border border-border bg-surface/40 px-2 py-1 text-xs text-foreground transition-colors hover:bg-brand-soft hover:text-brand-text"
                        >
                          {dirLabel(key, sort[idx].dir)}
                          <ArrowUpDown className="size-3 text-faint" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div role="group" aria-label="View" className={segmented}>
            {(
              [
                { id: "grid", label: "Grid view", Icon: LayoutGrid },
                { id: "list", label: "List view", Icon: List },
              ] as const
            ).map(({ id, label, Icon }) => (
              <button
                key={id}
                type="button"
                aria-label={label}
                aria-pressed={layout === id}
                title={label}
                onClick={() => setLayout(id)}
                className={cn("rounded-md px-2 py-1 transition-colors", layout === id ? segmentOn : segmentOff)}
              >
                <Icon className="size-3.5" />
              </button>
            ))}
          </div>

          {addable.length > 1 && (
            <button
              type="button"
              onClick={() => addToPipeline(addable)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-brand-soft hover:text-brand-text"
            >
              <Plus className="size-3.5" /> Add all {addable.length}
            </button>
          )}
        </div>
      </div>

      <RemovedBar />

      <div className={layout === "list" ? "flex flex-col gap-2" : "grid gap-3 sm:grid-cols-2 xl:grid-cols-3"}>
        {view.map((o) => (
          <DiscoveryCard key={o.url} offer={o} inPipeline={o.inPipeline} evaluatedN={o.evaluatedN} layout={layout === "list" ? "row" : "card"} />
        ))}
      </div>

      {view.length === 0 && (q.trim() || facetActive || hiddenBands.size > 0 || inPipelineCount > 0 || !running) && (
        <p className="py-10 text-center text-sm text-faint">
          {hiddenBands.size > 0 && !q.trim() && !facetActive
            ? "No results in the selected fit bands."
            : !includePipeline && inPipelineCount > 0 && offers.length === inPipelineCount && !q.trim() && !facetActive
              ? `All ${inPipelineCount} roles are already in your pipeline. Use “Show ${inPipelineCount} already in pipeline” to see them.`
              : "No results match these filters."}
        </p>
      )}
    </div>
  );
}
