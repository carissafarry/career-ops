"use client";

import { useSyncExternalStore } from "react";
import { shortAgo } from "@/lib/linkedin-watch/posted-age.mjs";

// One shared once-a-minute clock for every age label on the page (a list can hold hundreds of rows, so each
// row must not run a timer of its own). A label re-renders when the minute changes, so "5h ago" keeps moving
// while the page stays open.
const listeners = new Set<() => void>();
let minute = Math.floor(Date.now() / 60_000);
let timer: ReturnType<typeof setInterval> | undefined;

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!timer) {
    timer = setInterval(() => {
      minute = Math.floor(Date.now() / 60_000);
      listeners.forEach((l) => l());
    }, 60_000);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = undefined;
    }
  };
}

/** The current time in ms, moving once a minute. */
export function useMinuteClock(): number {
  return useSyncExternalStore(subscribe, () => minute, () => Math.floor(Date.now() / 60_000)) * 60_000;
}

function daysLabel(days: number): string {
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

/**
 * How long ago a posting went up. With an exact time (jobs from the LinkedIn watcher) the first day counts in
 * minutes and hours; otherwise, or after a day, it is the day count from the posted date, like every other row.
 */
export function AgeLabel({ postedDate, exact }: { postedDate?: string; exact?: string }) {
  const now = useMinuteClock();
  let text: string | null = null;
  const exactMs = exact ? Date.parse(exact) : NaN;
  if (Number.isFinite(exactMs)) {
    const ms = now - exactMs;
    text = ms < 86_400_000 ? shortAgo(ms) : daysLabel(Math.floor(ms / 86_400_000));
  } else if (postedDate && /^\d{4}-\d{2}-\d{2}$/.test(postedDate)) {
    const days = Math.floor((now - Date.parse(`${postedDate}T00:00:00Z`)) / 86_400_000);
    text = Number.isFinite(days) ? daysLabel(days) : null;
  }
  return text ? <span>{text}</span> : null;
}
