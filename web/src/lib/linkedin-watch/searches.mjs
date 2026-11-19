// Saved LinkedIn searches. The active search is data/linkedin-watch.yml; this file keeps the others by name,
// and the state stash in store.mjs keeps each search's own list, so nothing is lost when she switches.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import * as yaml from "js-yaml";
import { parseSearchUrl, WatchConfigError } from "./config.mjs";
import { emptyState, mergeStates } from "./state.mjs";
import { readState, writeState, readStatus, writeStatus, readStash, writeStash } from "./store.mjs";

const MAX_SEARCHES = 20;
const MAX_NAME = 60;
// LinkedIn adds these per visit or per page; they are dropped from a saved URL.
const VOLATILE = new Set(["currentJobId", "referralSearchId", "start"]);
// sortBy stays in the URL the watcher uses, but it only reorders the same results, so it is not part of which search this is.
const NOT_IDENTITY = new Set([...VOLATILE, "sortBy"]);

function cleanUrl(url, drop = VOLATILE) {
  const u = new URL(url);
  for (const key of drop) u.searchParams.delete(key);
  return u;
}

/** A short stable key for a search: the same search is the same key whatever job id or page LinkedIn added. */
export function searchKey(url) {
  try {
    const u = cleanUrl(url, NOT_IDENTITY);
    const params = [...u.searchParams.entries()].sort(([a], [b]) => a.localeCompare(b));
    return crypto.createHash("sha1").update(`${u.hostname}${u.pathname}?${JSON.stringify(params)}`).digest("hex").slice(0, 12);
  } catch {
    return "";
  }
}

export function readSearches(paths) {
  try {
    const parsed = yaml.load(fs.readFileSync(paths.searchesFile, "utf8"));
    return Array.isArray(parsed) ? parsed.filter((s) => s && s.id && s.name && s.url) : [];
  } catch {
    return [];
  }
}

function writeSearches(paths, list) {
  fs.mkdirSync(path.dirname(paths.searchesFile), { recursive: true });
  fs.writeFileSync(paths.searchesFile, yaml.dump(list));
}

/** Saves the active search under a name (renames it when that search is already saved). */
export function saveSearch(paths, activeUrl, name) {
  const clean = String(name ?? "").trim().slice(0, MAX_NAME);
  if (!clean) return { status: 400, body: { error: "Give the search a name." } };
  if (!activeUrl) return { status: 400, body: { error: "Save a valid search URL first." } };
  const id = searchKey(activeUrl);
  const list = readSearches(paths);
  const at = list.findIndex((s) => s.id === id);
  if (at >= 0) list[at] = { ...list[at], name: clean };
  else if (list.length >= MAX_SEARCHES) return { status: 400, body: { error: `You can keep up to ${MAX_SEARCHES} saved URLs. Delete one first.` } };
  else list.push({ id, name: clean, url: cleanUrl(activeUrl).toString() });
  writeSearches(paths, list);
  return { status: 200, body: { ok: true } };
}

export function findSearch(paths, id) {
  return readSearches(paths).find((s) => s.id === String(id)) ?? null;
}

/**
 * Changes the URL of a saved URLs in place: the name stays and so does the list. When the search is the one in
 * use, the watcher's URL changes with it (its list is already the active one). When it is not, its stashed list
 * moves to the new URL's key and the old copy is left where it is.
 */
export function updateSearch(paths, id, url, { activeUrl, setActiveUrl }) {
  const list = readSearches(paths);
  const at = list.findIndex((s) => s.id === String(id));
  if (at < 0) return { status: 404, body: { error: "Saved URLs not found." } };
  let clean;
  try {
    clean = cleanUrl(parseSearchUrl(url)).toString();
  } catch (e) {
    if (e instanceof WatchConfigError) return { status: 400, body: { error: e.message } };
    throw e;
  }
  const newId = searchKey(clean);
  const clash = list.find((s, i) => i !== at && s.id === newId);
  if (clash) return { status: 400, body: { error: `That URL is already saved as "${clash.name}".` } };
  const old = list[at];
  const wasActive = Boolean(activeUrl) && searchKey(activeUrl) === old.id;
  if (newId !== old.id && !wasActive) {
    const from = readStash(paths, old.id);
    if (from) {
      const to = readStash(paths, newId);
      writeStash(paths, newId, to ? mergeStates(to, from) : from);
    }
  }
  list[at] = { id: newId, name: old.name, url: clean };
  writeSearches(paths, list);
  if (wasActive) setActiveUrl(clean);
  return { status: 200, body: { ok: true } };
}

/** Removes the list entry only. Its postings stay stashed and come back if the same URL is used again. */
export function deleteSearch(paths, id) {
  const list = readSearches(paths);
  if (!list.some((s) => s.id === String(id))) return { status: 404, body: { error: "Saved URLs not found." } };
  writeSearches(paths, list.filter((s) => s.id !== String(id)));
  return { status: 200, body: { ok: true } };
}

/**
 * The active search changed from `fromUrl` to `toUrl`: stash the current list under the old search and load the
 * new search's own list (empty the first time, so its first poll takes a baseline instead of flooding in as new).
 */
export function switchSearch(paths, fromUrl, toUrl) {
  const from = fromUrl ? searchKey(fromUrl) : "";
  const to = searchKey(toUrl);
  if (!from || !to || from === to) return;
  writeStash(paths, from, readState(paths));
  writeState(paths, readStash(paths, to) ?? emptyState());
  const status = readStatus(paths);
  writeStatus(paths, { ...status, lastNewCount: null, lastBaseline: false, lastRead: null, lastPages: 1 });
}

/** The saved URLs with which one is active and how many postings each holds. */
export function listSearches(paths, activeUrl) {
  const active = activeUrl ? searchKey(activeUrl) : "";
  return readSearches(paths).map((s) => ({
    ...s,
    active: s.id === active,
    count: s.id === active ? readState(paths).postings.length : readStash(paths, s.id)?.postings.length ?? 0,
  }));
}
