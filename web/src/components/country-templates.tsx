"use client";

import { Check, Ban } from "lucide-react";
import { COUNTRY_TEMPLATES, countryState, cycleCountry } from "@/lib/location-countries.mjs";
import { cn } from "@/lib/cn";

// Country buttons for a location filter. Click once to include a country, again to
// exclude it, a third time to clear it. The two lists belong to the caller, so the
// same buttons work on the scan builder and on every results list.
export function CountryTemplates({
  include,
  exclude,
  onChange,
}: {
  include: string[];
  exclude: string[];
  onChange: (next: { include: string[]; exclude: string[] }) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Country shortcuts">
      {COUNTRY_TEMPLATES.map((country) => {
        const state = countryState(include, exclude, country);
        return (
          <button
            key={country}
            type="button"
            onClick={() => onChange(cycleCountry(include, exclude, country))}
            aria-label={`${country}: ${state === "include" ? "included" : state === "exclude" ? "excluded" : "not set"}`}
            title={state === "none" ? `Include ${country}` : state === "include" ? `Included. Click to exclude ${country}` : `Excluded. Click to clear ${country}`}
            className={cn(
              "inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors max-sm:min-h-[44px]",
              state === "include" && "border-brand/40 bg-brand-soft text-brand-text",
              state === "exclude" && "border-rose-500/40 bg-rose-500/10 text-rose-600 line-through dark:text-rose-400",
              state === "none" && "border-border text-muted hover:text-foreground",
            )}
          >
            {state === "include" && <Check className="size-3" aria-hidden="true" />}
            {state === "exclude" && <Ban className="size-3" aria-hidden="true" />}
            {country}
          </button>
        );
      })}
    </div>
  );
}
