"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { useExplore } from "./explore-provider";

// A role taken out of the pipeline leaves the list at once. This toast names the last
// one and puts it back, and stays until it is used or dismissed. It is pinned to the bottom of the window: the role may have
// been far down a long list, where a line above the list would be out of sight.
export function RemovedBar() {
  const { removedOffers, adding, addToPipeline } = useExplore();
  const [dismissed, setDismissed] = useState("");
  // The role comes from the provider, not from the list on screen: a list that reloads
  // after the removal no longer holds it, and Undo must still be there.
  const last = removedOffers[removedOffers.length - 1];
  if (!last || dismissed === last.url) return null;
  const more = removedOffers.length - 1;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-44 z-40 flex justify-center px-4 sm:bottom-20">
      <div
        role="status"
        className="pointer-events-auto inline-flex max-w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl border-2 border-brand bg-surface px-4 py-2.5 text-sm text-foreground shadow-2xl ring-4 ring-brand/20"
      >
        <span className="min-w-0 max-w-[32rem] flex-1 truncate">
          Removed from pipeline: <span className="font-medium">{last.title}</span>
          {last.company ? ` · ${last.company}` : ""}
          {more > 0 ? ` (and ${more} more)` : ""}
        </span>
        <button
          type="button"
          disabled={adding.has(last.url)}
          onClick={() => void addToPipeline([last])}
          className="rounded-full bg-brand px-3.5 py-1 text-xs font-semibold text-brand-foreground transition-opacity hover:opacity-90 disabled:opacity-60 max-sm:min-h-[44px]"
        >
          Undo
        </button>
        <button
          type="button"
          aria-label="Dismiss"
          onClick={() => setDismissed(last.url)}
          className="rounded-full p-1 text-muted transition-colors hover:text-foreground max-sm:min-h-[44px] max-sm:min-w-[44px]"
        >
          <X className="mx-auto size-3.5" />
        </button>
      </div>
    </div>
  );
}
