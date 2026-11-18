"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Ban, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { siteFromUrl, siteLabel, useSourceFilter, type SourceMode, type SourceScope } from "@/lib/source-exclusions";

// "Sources": choose which sites a vacancy list shows. "Hide" removes the checked
// sites; "Only show" keeps just the checked ones. The sites found in this list are
// checkboxes with their counts, and any other site (one that is not in this list
// right now) can be typed in. Each page keeps its own choice.
const MODES: { mode: SourceMode; label: string; hint: string }[] = [
  { mode: "exclude", label: "Hide", hint: "Vacancies from a checked site are hidden." },
  { mode: "include", label: "Only show", hint: "Only vacancies from the checked sites are shown." },
];

export function SourceExclusionMenu({ urls, scope }: { urls: string[]; scope: SourceScope }) {
  const { excluded, included, add, remove, reset } = useSourceFilter(scope);
  const [mode, setMode] = useState<SourceMode>("exclude");
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [rejected, setRejected] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  const present = useMemo(() => {
    const counts = new Map<string, number>();
    for (const url of urls) {
      const site = siteFromUrl(url);
      if (site) counts.set(site, (counts.get(site) ?? 0) + 1);
    }
    return counts;
  }, [urls]);
  const chosen = mode === "exclude" ? excluded : included;
  // Present sites first, biggest first. Chosen sites that are not in this list still show, so they can be undone.
  const rows = useMemo(() => {
    const sites = new Set([...present.keys(), ...chosen]);
    return [...sites].sort((a, b) => (present.get(b) ?? 0) - (present.get(a) ?? 0) || a.localeCompare(b));
  }, [present, chosen]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      button.current?.focus();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const submit = () => {
    if (!add(mode, draft)) {
      setRejected(true);
      return;
    }
    setRejected(false);
    setDraft("");
  };

  return (
    <div ref={root} className="relative shrink-0">
      <button
        ref={button}
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors max-sm:min-h-[44px]",
          excluded.length + included.length > 0 ? "border-brand/40 bg-brand-soft text-brand-text" : "border-border text-muted hover:text-foreground",
        )}
      >
        <Ban className="size-3" aria-hidden="true" />
        Sources
        {included.length > 0 && <span className="tabular-nums">· only {included.length}</span>}
        {excluded.length > 0 && <span className="tabular-nums">· hide {excluded.length}</span>}
      </button>
      {open && (
        <div role="group" aria-label="Sources" className="absolute left-0 top-full z-30 mt-2 w-72 max-sm:fixed max-sm:inset-x-4 max-sm:top-1/3 max-sm:w-auto rounded-xl border border-border bg-surface p-3 text-sm shadow-card">
          <div role="tablist" aria-label="Source rule" className="inline-flex rounded-lg border border-border bg-surface p-0.5">
            {MODES.map((m) => (
              <button
                key={m.mode}
                type="button"
                role="tab"
                aria-selected={mode === m.mode}
                onClick={() => setMode(m.mode)}
                className={cn("rounded-md px-2.5 py-1 text-xs font-medium transition-colors", mode === m.mode ? "bg-brand-soft text-brand-text" : "text-muted hover:text-foreground")}
              >
                {m.label}
                {(m.mode === "exclude" ? excluded : included).length > 0 && <span className="ml-1 tabular-nums">{(m.mode === "exclude" ? excluded : included).length}</span>}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted">{MODES.find((m) => m.mode === mode)?.hint} The same choice applies in the Inbox, Scans and Explore.</p>
          <ul className="mt-2 max-h-56 space-y-0.5 overflow-y-auto">
            {rows.length === 0 && <li className="py-1 text-xs text-faint">No sites in this list yet.</li>}
            {rows.map((site) => {
              const on = chosen.includes(site);
              const count = present.get(site) ?? 0;
              return (
                <li key={site}>
                  <label className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 hover:bg-surface-hover">
                    <input type="checkbox" checked={on} onChange={() => (on ? remove(mode, site) : add(mode, site))} />
                    <span className="flex-1 truncate text-foreground">{siteLabel(site)}</span>
                    <span className="text-xs tabular-nums text-faint">{count}</span>
                  </label>
                </li>
              );
            })}
          </ul>
          <form
            className="mt-2 flex items-center gap-2 border-t border-border pt-2"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <input
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                setRejected(false);
              }}
              aria-label={mode === "exclude" ? "Site to hide" : "Site to show"}
              placeholder="Add a site, e.g. kalibrr"
              className="min-w-0 flex-1 rounded-md border border-border bg-transparent px-2 py-1 text-xs outline-none placeholder:text-faint focus:border-brand/50"
            />
            <button type="submit" disabled={!draft.trim()} className="rounded-md border border-border px-2 py-1 text-xs font-medium text-foreground hover:bg-surface-hover disabled:opacity-50">
              Add
            </button>
          </form>
          {rejected && <p role="alert" className="mt-1 text-xs text-red-700 dark:text-red-400">That is not a site name.</p>}
          {excluded.length + included.length > 0 && (
            <button type="button" onClick={reset} className="mt-2 inline-flex items-center gap-1 text-xs text-faint hover:text-foreground">
              <X className="size-3" aria-hidden="true" /> Show all sites again
            </button>
          )}
        </div>
      )}
    </div>
  );
}
