"use client";

import { Search, X } from "lucide-react";
import { FRESHNESS_WINDOWS, PLATFORM_LABEL, SENIORITY_LABEL, type PlatformSource, type Seniority } from "@/lib/inbox";
import { CostBadge } from "@/components/cost/cost-badge";
import { cn } from "@/lib/cn";
import { CountryTemplates, RegionTemplates } from "@/components/country-templates";
import { listOf, textOf } from "@/lib/location-countries.mjs";
import { SourceExclusionMenu } from "@/components/inbox/source-exclusion-menu";
import type { SourceScope } from "@/lib/source-exclusions";

// Free, client-side facets over the raw firehose — 0 tokens, instant. Mirrors the
// Explore chip language so the two surfaces read as one system. One labeled row per
// kind of filter; chips wrap onto the next line, never off the side of the page.
export function FacetChips({
  within,
  setWithin,
  sources,
  toggleSource,
  seniorities,
  toggleSeniority,
  locQ,
  setLocQ,
  locNot,
  setLocNot,
  kw,
  setKw,
  availSources,
  availSeniorities,
  allUrls,
  sourceScope,
  resultCount,
  totalCount,
  anyActive,
  onClear,
}: {
  within: number | null;
  setWithin: (d: number | null) => void;
  sources: Set<PlatformSource>;
  toggleSource: (s: PlatformSource) => void;
  seniorities: Set<Seniority>;
  toggleSeniority: (s: Seniority) => void;
  locQ: string;
  setLocQ: (v: string) => void;
  /** Places to hide, comma separated ("Jogja, Bali"). */
  locNot: string;
  setLocNot: (v: string) => void;
  kw: string;
  setKw: (v: string) => void;
  availSources: PlatformSource[];
  availSeniorities: Seniority[];
  /** Every posting URL in the list, for the sites the exclusion menu offers. */
  allUrls: string[];
  /** Which page this list is on; each page keeps its own Sources choice. */
  sourceScope: SourceScope;
  resultCount: number;
  totalCount: number;
  anyActive: boolean;
  onClear: () => void;
}) {
  return (
    <div className="space-y-2.5">
      {/* keyword search + live count */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
          <input
            value={kw}
            onChange={(e) => setKw(e.target.value)}
            placeholder="Filter by company or role…"
            className="w-full rounded-lg border border-border bg-surface py-2 pl-9 pr-3 text-sm outline-none transition-colors placeholder:text-faint focus:border-brand/50 focus-visible:ring-2 focus-visible:ring-brand/40 max-sm:min-h-[44px]"
          />
        </div>
        <span className="shrink-0 text-xs text-muted">
          <span className="tabular-nums text-foreground">{resultCount}</span>
          <span className="text-faint">/{totalCount}</span>
        </span>
      </div>

      {/* One row per kind of filter, each with a small label. Chips wrap on desktop and
          scroll inside their own row on mobile. */}
      <div className="space-y-2">
        <Row label="Posted">
          <div className="inline-flex shrink-0 rounded-lg border border-border bg-surface p-0.5">
            {FRESHNESS_WINDOWS.map((w) => (
              <button
                key={w.days}
                type="button"
                onClick={() => setWithin(within === w.days ? null : w.days)}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-medium transition-colors max-sm:min-h-[44px]",
                  within === w.days ? "bg-brand-soft text-brand-text" : "text-muted hover:text-foreground",
                )}
              >
                {w.label}
              </button>
            ))}
          </div>
        </Row>

        {availSources.length > 0 && (
          <Row label="Platform">
            {availSources.map((s) => (
              <Pill key={s} on={sources.has(s)} onClick={() => toggleSource(s)}>
                {PLATFORM_LABEL[s]}
              </Pill>
            ))}
          </Row>
        )}

        {availSeniorities.length > 0 && (
          <Row label="Level">
            {availSeniorities.map((s) => (
              <Pill key={s} on={seniorities.has(s)} onClick={() => toggleSeniority(s)}>
                {SENIORITY_LABEL[s]}
              </Pill>
            ))}
          </Row>
        )}

        <Row label="Region">
          <RegionTemplates
            noCountry
            include={listOf(locQ)}
            exclude={listOf(locNot)}
            onChange={(next) => { setLocQ(textOf(next.include)); setLocNot(textOf(next.exclude)); }}
          />
        </Row>

        <Row label="Country">
          <CountryTemplates
            include={listOf(locQ)}
            exclude={listOf(locNot)}
            onChange={(next) => { setLocQ(textOf(next.include)); setLocNot(textOf(next.exclude)); }}
          />
        </Row>

        <Row label="Location">
          <TextFilter value={locQ} onChange={setLocQ} placeholder="Country or city, or a few" ariaLabel="Location or country" />
          <span className="shrink-0 text-xs text-faint">but not</span>
          <TextFilter value={locNot} onChange={setLocNot} placeholder="Jogja, Bali" ariaLabel="Hide locations" />
        </Row>

        <Row label="Sites">
          <SourceExclusionMenu urls={allUrls} scope={sourceScope} />
          {anyActive && (
            <button
              type="button"
              onClick={onClear}
              className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-full px-2 text-xs text-faint transition-colors hover:text-foreground max-sm:min-h-[44px]"
            >
              <X className="size-3" /> Clear filters
            </button>
          )}
        </Row>
      </div>

      {/* Token-honesty is bidirectional: the "free" reassurance is as always-visible
          as the tray's "spend" cue (mobile + desktop) — never desktop-only. */}
      <div className="flex items-center gap-1.5">
        <CostBadge kind="free" size="xs" />
        <span className="text-xs text-faint">Filtering is free — only scoring uses tokens.</span>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span className="w-16 shrink-0 text-xs text-faint max-sm:pt-3 sm:pt-1.5">{label}</span>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

function TextFilter({ value, onChange, placeholder, ariaLabel }: { value: string; onChange: (v: string) => void; placeholder: string; ariaLabel: string }) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      aria-label={ariaLabel}
      className="w-40 shrink-0 rounded-full border border-border bg-surface px-3 py-1 text-xs outline-none transition-colors placeholder:text-faint focus:border-brand/40 max-sm:min-h-[44px]"
    />
  );
}

function Pill({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "shrink-0 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors max-sm:min-h-[44px]",
        on ? "border-brand/40 bg-brand-soft text-brand-text" : "border-border text-muted hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
