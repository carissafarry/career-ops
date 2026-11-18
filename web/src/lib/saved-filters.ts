import { useCallback, useSyncExternalStore } from "react";
import { filtersToParams, type ExploreFilters } from "@/lib/explore";
import { cleanName, filtersOf, sameFilters } from "./saved-filters-core.mjs";

export { cleanName, filtersOf, sameFilters };

// Named Explore filter sets the user saved to come back to ("Backend", "Management
// trainee"). Each one is kept as the filter URL query (filtersToParams), the same
// codec Explore already uses to restore a search, so a saved set is read back
// through the one place that cleans and clamps filter values. The list lives in
// this browser only and stays until the user deletes it.

const KEY = "co-explore-saved-filters";
const EVENT = "co-explore-saved-filters-changed";

export type SavedFilter = { id: string; name: string; query: string };

const NONE: SavedFilter[] = [];
let cache: { raw: string | null; list: SavedFilter[] } | null = null;

function isSaved(v: unknown): v is SavedFilter {
  const o = v as Record<string, unknown> | null;
  return !!o && typeof o.id === "string" && typeof o.name === "string" && o.name !== "" && typeof o.query === "string";
}

function read(): SavedFilter[] {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(KEY);
  } catch {
    /* storage blocked: nothing is saved */
  }
  if (cache && cache.raw === raw) return cache.list;
  let list = NONE;
  try {
    const parsed = JSON.parse(raw ?? "[]");
    if (Array.isArray(parsed)) list = parsed.filter(isSaved);
  } catch {
    /* unreadable value: nothing is saved */
  }
  cache = { raw, list };
  return list;
}

function write(list: SavedFilter[]) {
  const raw = JSON.stringify(list);
  try {
    window.localStorage.setItem(KEY, raw);
  } catch {
    /* the change still shows until the page closes */
  }
  cache = { raw, list };
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

export function useSavedFilters() {
  const saved = useSyncExternalStore(subscribe, read, () => NONE);
  /** Saves under the name; a name already in the list (any case) is replaced in place. */
  const save = useCallback((name: string, filters: ExploreFilters) => {
    const clean = cleanName(name);
    if (!clean) return false;
    const query = filtersToParams(filters);
    const list = read();
    const at = list.findIndex((s) => s.name.toLowerCase() === clean.toLowerCase());
    if (at >= 0) write(list.map((s, i) => (i === at ? { ...s, name: clean, query } : s)));
    else write([...list, { id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, name: clean, query }]);
    return true;
  }, []);
  const remove = useCallback((id: string) => write(read().filter((s) => s.id !== id)), []);
  return { saved, save, remove };
}
