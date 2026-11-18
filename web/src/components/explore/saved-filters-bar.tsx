"use client";

import { useState } from "react";
import { Bookmark, X } from "lucide-react";
import { cn } from "@/lib/cn";
import type { ExploreFilters } from "@/lib/explore";
import { cleanName, filtersOf, sameFilters, useSavedFilters } from "@/lib/saved-filters";

// Save the filters on screen under a name and load them back later, so a different
// search (say "Management trainee") does not mean losing the rules built so far.
// Loading replaces the filters on screen; saved sets stay until deleted here.
export function SavedFiltersBar({
  filters,
  onLoad,
}: {
  filters: ExploreFilters;
  onLoad: (f: ExploreFilters) => void;
}) {
  const { saved, save, remove } = useSavedFilters();
  const [naming, setNaming] = useState(false);
  const [draft, setDraft] = useState("");
  const [notice, setNotice] = useState("");

  const replaces = saved.some((s) => s.name.toLowerCase() === cleanName(draft).toLowerCase());
  const commit = () => {
    if (!save(draft, filters)) return;
    setNotice(`Saved "${cleanName(draft)}".`);
    setDraft("");
    setNaming(false);
  };

  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-4">
        <span className="text-[14px] font-medium text-foreground">Saved filters</span>
        <span className="ml-4 text-right text-xs text-faint">loading one replaces the filters below</span>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {saved.map((s) => {
          const on = sameFilters(s, filters);
          return (
            <span
              key={s.id}
              className={cn(
                "inline-flex items-center rounded-full border text-xs font-medium transition-colors",
                on ? "border-brand/40 bg-brand-soft text-brand-text" : "border-border text-muted hover:text-foreground",
              )}
            >
              <button
                type="button"
                aria-pressed={on}
                onClick={() => {
                  setNotice(`Loaded "${s.name}".`);
                  onLoad(filtersOf(s));
                }}
                className="rounded-l-full py-1 pl-2.5 pr-1.5 max-sm:min-h-[44px]"
              >
                {s.name}
              </button>
              <button
                type="button"
                aria-label={`Delete saved filter ${s.name}`}
                onClick={() => {
                  setNotice(`Deleted "${s.name}".`);
                  remove(s.id);
                }}
                className="rounded-r-full py-1 pl-0.5 pr-2 opacity-60 hover:opacity-100 max-sm:min-h-[44px] max-sm:min-w-[44px]"
              >
                <X className="mx-auto size-3" />
              </button>
            </span>
          );
        })}
        {!naming && (
          <button
            type="button"
            onClick={() => {
              setNotice("");
              setNaming(true);
            }}
            className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-border px-2.5 py-1 text-xs font-medium text-muted transition-colors hover:border-brand/40 hover:text-brand-text max-sm:min-h-[44px]"
          >
            <Bookmark className="size-3.5" /> Save current filters
          </button>
        )}
        {naming && (
          <span className="inline-flex items-center gap-1.5">
            <input
              autoFocus
              value={draft}
              maxLength={40}
              aria-label="Name for these filters"
              placeholder="Name, e.g. Backend"
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commit();
                } else if (e.key === "Escape") {
                  setNaming(false);
                  setDraft("");
                }
              }}
              className="w-40 rounded-full border border-border bg-surface/40 px-3 py-1 text-xs outline-none transition-colors placeholder:text-faint focus:border-brand/40 max-sm:min-h-[44px]"
            />
            <button
              type="button"
              disabled={!cleanName(draft)}
              onClick={commit}
              className="rounded-full border border-border px-2.5 py-1 text-xs font-medium text-muted transition-colors hover:border-brand/40 hover:text-brand-text disabled:cursor-not-allowed disabled:opacity-60 max-sm:min-h-[44px]"
            >
              {replaces ? "Replace" : "Save"}
            </button>
            <button
              type="button"
              onClick={() => {
                setNaming(false);
                setDraft("");
              }}
              className="text-xs text-muted hover:text-foreground max-sm:min-h-[44px]"
            >
              Cancel
            </button>
          </span>
        )}
      </div>
      <p role="status" aria-live="polite" className="mt-1 min-h-4 text-xs text-muted">
        {notice || (saved.length === 0 ? "Nothing saved yet. Set the filters you want, then save them under a name." : "")}
      </p>
    </div>
  );
}
