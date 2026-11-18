import { useCallback, useSyncExternalStore } from "react";

// Which sites the user wants in vacancy lists (Inbox, Scans, Explore): sites to
// hide, and sites to show exclusively. A site is the name of the posting's host without the country or "www": jobs on
// kalibrr.com and www.kalibrr.com.ph are both "kalibrr". The list lives in this
// browser only. Each page keeps its own (its scope), so a rule set on the Inbox
// does not touch Scans or Explore, and each is kept until the user removes it.

export type SourceScope = "inbox" | "scans" | "explore";
const EVENT = "co-source-rules-changed";
// Second-level labels that sit under a country code ("co.id", "com.au", "ac.uk").
const SECOND_LEVEL = new Set(["co", "com", "org", "net", "gov", "ac", "edu", "or", "ne"]);

/** The site a posting URL belongs to, or null when it has no readable host. */
export function siteFromUrl(url: string): string | null {
  let host = "";
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
  return siteFromHost(host);
}

function siteFromHost(host: string): string | null {
  const parts = host.replace(/\.$/, "").split(".").filter(Boolean);
  if (parts.length === 0) return null;
  if (parts.length === 1) return parts[0];
  const tld = parts[parts.length - 1];
  const second = parts[parts.length - 2];
  if (parts.length >= 3 && tld.length === 2 && SECOND_LEVEL.has(second)) return parts[parts.length - 3];
  return second;
}

/** What the user typed ("Kalibrr", "kalibrr.com", "https://www.jobstreet.co.id/x") as a site name. */
export function normalizeSite(input: string): string | null {
  const text = input.trim().toLowerCase();
  if (!text) return null;
  const host = text.replace(/^[a-z][a-z0-9+.-]*:\/\//, "").split(/[/?#\s]/)[0];
  if (!host) return null;
  return host.includes(".") ? siteFromHost(host) : host.replace(/[^a-z0-9-]/g, "") || null;
}

export function siteLabel(site: string): string {
  return site.charAt(0).toUpperCase() + site.slice(1);
}

const NONE: string[] = [];
const caches = new Map<string, { raw: string | null; list: string[] }>();

function read(key: string): string[] {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(key);
  } catch {
    /* storage blocked: no rule is set */
  }
  const cached = caches.get(key);
  if (cached && raw === cached.raw) return cached.list;
  let list = NONE;
  try {
    const parsed = JSON.parse(raw ?? "[]");
    if (Array.isArray(parsed)) list = parsed.filter((s): s is string => typeof s === "string" && s !== "");
  } catch {
    /* unreadable value: no rule is set */
  }
  caches.set(key, { raw, list });
  return list;
}

function write(key: string, list: string[]) {
  const raw = JSON.stringify(list);
  try {
    window.localStorage.setItem(key, raw);
  } catch {
    /* the change still shows until the page closes */
    caches.set(key, { raw, list });
  }
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export type SourceMode = "exclude" | "include";

/**
 * A posting is hidden when its site is in the exclude list, or when an include
 * list is set and its site is not on it. A site is on one list at a time:
 * adding it to one takes it off the other.
 */
export function isHiddenBy(url: string, excluded: string[], included: string[]): boolean {
  if (excluded.length === 0 && included.length === 0) return false;
  const site = siteFromUrl(url);
  if (site !== null && excluded.includes(site)) return true;
  return included.length > 0 && (site === null || !included.includes(site));
}

export function useSourceFilter(scope: SourceScope) {
  const EXCLUDE_KEY = `co-excluded-sites:${scope}`;
  const INCLUDE_KEY = `co-included-sites:${scope}`;
  const excluded = useSyncExternalStore(subscribe, () => read(EXCLUDE_KEY), () => NONE);
  const included = useSyncExternalStore(subscribe, () => read(INCLUDE_KEY), () => NONE);
  const isHidden = useCallback((url: string) => isHiddenBy(url, excluded, included), [excluded, included]);
  const add = useCallback((mode: SourceMode, input: string) => {
    const site = normalizeSite(input);
    if (!site) return false;
    const [own, other] = mode === "exclude" ? [EXCLUDE_KEY, INCLUDE_KEY] : [INCLUDE_KEY, EXCLUDE_KEY];
    if (read(other).includes(site)) write(other, read(other).filter((s) => s !== site));
    if (!read(own).includes(site)) write(own, [...read(own), site]);
    return true;
  }, [EXCLUDE_KEY, INCLUDE_KEY]);
  const remove = useCallback((mode: SourceMode, site: string) => {
    const key = mode === "exclude" ? EXCLUDE_KEY : INCLUDE_KEY;
    write(key, read(key).filter((s) => s !== site));
  }, [EXCLUDE_KEY, INCLUDE_KEY]);
  const reset = useCallback(() => {
    write(EXCLUDE_KEY, []);
    write(INCLUDE_KEY, []);
  }, [EXCLUDE_KEY, INCLUDE_KEY]);
  return { excluded, included, isHidden, add, remove, reset };
}
