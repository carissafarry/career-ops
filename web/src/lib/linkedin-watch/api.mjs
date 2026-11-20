// Handler logic for the /api/linkedin-watch routes (kept out of the route files so it is testable).
import fs from "node:fs";
import path from "node:path";
import * as yaml from "js-yaml";
import { nextDelayMs, parseWatchConfig, WatchConfigError } from "./config.mjs";
import { handleIngest } from "./ingest.mjs";
import { notifyMac } from "./notify.mjs";
import { hasFilters } from "./config.mjs";
import { normalizeRawCards } from "./page-read.mjs";
import { postedAtMs } from "./posted-age.mjs";
import { recordPosted } from "./posted-log.mjs";
import { appendOrigin, appendPollLog, linkedinScanId, originLines, readLastPoll } from "./scan-log.mjs";
import { readState, writeState, readStatus, writeStatus } from "./store.mjs";
import { deleteSearch, findSearch, listSearches, saveSearch, searchKey, switchSearch, updateSearch } from "./searches.mjs";

const CONFIG_KEYS = ["search_url", "interval_minutes", "jitter_percent", "max_polls_per_day", "active_hours", "pages_per_poll", "deep_pages", "max_age_hours", "filters"];

export function readRawConfig(paths) {
  try {
    const parsed = yaml.load(fs.readFileSync(paths.configFile, "utf8"));
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function loadConfig(paths) {
  const raw = readRawConfig(paths);
  if (!raw) return null;
  try {
    return parseWatchConfig(raw);
  } catch {
    return null;
  }
}

export function getOverview(paths) {
  const state = readState(paths);
  return {
    config: readRawConfig(paths) ?? {},
    status: readStatus(paths),
    postings: state.postings,
    baselineAt: state.baselineAt,
    lastPoll: readLastPoll(paths.pollLogFile), // the answer to "did the last poll find anything new?", also for older status files
    knownCount: Object.keys(state.seen).length,
    searches: listSearches(paths, readRawConfig(paths)?.search_url),
  };
}

export function getExtensionConfig(paths) {
  const cfg = loadConfig(paths);
  const status = readStatus(paths);
  const enabled = Boolean(cfg) && status.state === "running";
  // The first read (no baseline yet) and a manual "Run now" read deeper; scheduled polls read few pages.
  const deep = Boolean(status.runNowRequestedAt) || !readState(paths).baselineAt;
  const pages = cfg ? (deep ? cfg.deepPages : cfg.pagesPerPoll) : 1;
  return { enabled, searchUrl: cfg?.searchUrl ?? null, runNow: enabled && Boolean(status.runNowRequestedAt), pages, nextPollAt: enabled ? status.nextPollAt ?? null : null };
}

const SOON_MS = 30_000; // the shortest wait the extension schedules

/**
 * After the interval or the jitter changes, the poll already planned still has the old wait. Re-plan it from the
 * last poll with the new settings (at least SOON_MS from now), so "Next poll" is right at once and the extension,
 * which follows nextPollAt, moves its alarm.
 */
function replanNextPoll(paths, before, after, { now = new Date(), random = Math.random } = {}) {
  if (!before || (before.intervalMinutes === after.intervalMinutes && before.jitterPercent === after.jitterPercent)) return;
  const status = readStatus(paths);
  if (status.state !== "running" || !status.nextPollAt) return;
  const base = status.lastPollAt ? Date.parse(status.lastPollAt) : now.getTime();
  const next = Math.max(base + nextDelayMs(after, random), now.getTime() + SOON_MS);
  writeStatus(paths, { ...status, nextPollAt: new Date(next).toISOString() });
}

export function applyAction(paths, body, deps = {}) {
  const action = body?.action;
  if (action === "save-config") {
    const raw = Object.fromEntries(CONFIG_KEYS.filter((k) => body[k] !== undefined && body[k] !== "").map((k) => [k, body[k]]));
    let parsed;
    const before = loadConfig(paths);
    try {
      parsed = parseWatchConfig(raw);
    } catch (e) {
      if (e instanceof WatchConfigError) return { status: 400, body: { error: e.message } };
      throw e;
    }
    fs.mkdirSync(path.dirname(paths.configFile), { recursive: true });
    fs.writeFileSync(paths.configFile, yaml.dump(raw));
    switchSearch(paths, before?.searchUrl, parsed.searchUrl);
    replanNextPoll(paths, before, parsed, deps);
    return { status: 200, body: { ok: true } };
  }
  if (action === "save-search") return saveSearch(paths, loadConfig(paths)?.searchUrl, body.name);
  if (action === "delete-search") return deleteSearch(paths, body.id);
  if (action === "update-search") {
    return updateSearch(paths, body.id, body.url, {
      activeUrl: loadConfig(paths)?.searchUrl,
      setActiveUrl: (url) => fs.writeFileSync(paths.configFile, yaml.dump({ ...(readRawConfig(paths) ?? {}), search_url: url })),
    });
  }
  if (action === "use-search") {
    const saved = findSearch(paths, body.id);
    if (!saved) return { status: 404, body: { error: "Saved URLs not found." } };
    return applyAction(paths, { ...(readRawConfig(paths) ?? {}), action: "save-config", search_url: saved.url }, deps);
  }
  if (action === "enable" || action === "resume" || action === "disable") {
    if (action !== "disable" && !loadConfig(paths)) {
      return { status: 400, body: { error: "Save a valid search URL first." } };
    }
    const status = readStatus(paths);
    writeStatus(paths, action === "disable"
      ? { ...status, state: "stopped", nextPollAt: null }
      : { ...status, state: "running", haltReason: null, consecutiveFailures: 0 });
    return { status: 200, body: { ok: true } };
  }
  if (action === "ack") {
    // Marks postings as seen by the user (clears the highlight): one id, or all when no id is given.
    const state = readState(paths);
    const id = body.id === undefined ? null : String(body.id);
    writeState(paths, { ...state, postings: state.postings.map((p) => (id === null || p.id === id ? { ...p, acknowledged: true } : p)) });
    return { status: 200, body: { ok: true } };
  }
  if (action === "remove") return removePostings(paths, body.ids);
  if (action === "run-now") {
    const status = readStatus(paths);
    if (status.state !== "running" || !loadConfig(paths)) {
      return { status: 400, body: { error: "Enable the watcher first, then run now." } };
    }
    writeStatus(paths, { ...status, runNowRequestedAt: new Date().toISOString() });
    return { status: 200, body: { ok: true } };
  }
  return { status: 400, body: { error: "Unknown action." } };
}

function validPayload(p) {
  return p && Array.isArray(p.cards) && p.page && typeof p.page.url === "string"
    && typeof p.page.title === "string" && typeof p.page.bodyText === "string" && typeof p.page.status === "number";
}

export async function ingest(paths, payload, origin, deps = {}) {
  if (!String(origin ?? "").startsWith("chrome-extension://")) return { status: 403, body: { error: "Forbidden." } };
  if (!validPayload(payload)) return { status: 400, body: { error: "Bad payload." } };
  const cfg = loadConfig(paths);
  if (!cfg) return { status: 200, body: { enabled: false, nextDelayMs: 0, searchUrl: null } };
  // A filter that cannot be built fails open (keep everything) and is reported, so jobs are never hidden silently.
  let keep = null;
  let filterError = null;
  try {
    if (hasFilters(cfg.filters)) {
      if (typeof deps.runFilter !== "function") throw new Error("the filter runner is not available");
      const kept = await deps.runFilter(cfg.filters, normalizeRawCards(payload.cards));
      keep = (card) => kept.has(card.id);
    }
  } catch (e) {
    filterError = e.message;
    console.error("linkedin-watch: filter unavailable:", e.message);
  }
  // One instant for the poll and for the scan record: they are matched by it. A second clock read can land
  // a few ms later (file reads, first-run code), which silently breaks the match.
  const clock = deps.clock ?? (() => new Date());
  const now = deps.now ?? clock();
  const out = handleIngest({
    payload, cfg, state: readState(paths), status: readStatus(paths),
    now, random: deps.random ?? Math.random, notify: deps.notify ?? notifyMac, keep,
  });
  out.status = { ...out.status, filterError };
  // Everything first seen on this poll (the baseline list, or the new ones) becomes one scan on /scans.
  const nowIso = now.toISOString();
  let state = out.state;
  const fresh = state.postings.filter((p) => p.firstSeen === nowIso && !p.scanId);
  if (fresh.length > 0) {
    const scanId = linkedinScanId(nowIso);
    try {
      appendOrigin(paths.originFile, originLines(fresh, scanId, nowIso));
      const ids = new Set(fresh.map((p) => p.id));
      state = { ...state, postings: state.postings.map((p) => (ids.has(p.id) ? { ...p, scanId } : p)) };
    } catch (e) {
      console.error("linkedin-watch: could not write scan-origin.tsv:", e.message);
    }
  }
  // Every poll that was actually recorded (not idle hours, not stopped, not halted) is one line of history.
  if (out.status.lastPollAt === nowIso) {
    const listed = state.postings.filter((p) => p.firstSeen === nowIso);
    const baseline = listed.some((p) => p.baseline);
    try {
      appendPollLog(paths.pollLogFile, {
        startedAt: nowIso, read: out.status.lastCardCount ?? 0, kept: out.status.lastKeptCount ?? 0,
        added: listed.length, baseline, search: searchKey(cfg.searchUrl ?? ""),
      });
    } catch (e) {
      console.error("linkedin-watch: could not write the poll log:", e.message);
    }
  }
  writeState(paths, state);
  writeStatus(paths, out.status);
  return { status: 200, body: out.reply };
}

// The Pipeline stores a date only, so the offer carries the date of LinkedIn's estimate (empty when LinkedIn gave no age);
// the hour is kept next to it by recordPosted and read back for these rows.
const estimateOf = (p) => postedAtMs(p.postedText, p.firstSeen);
const toOffer = (p) => {
  const at = estimateOf(p);
  return {
    url: p.link, company: p.company, title: p.title, location: p.location,
    postedAt: at === null ? "" : new Date(at).toISOString().slice(0, 10), ats: "linkedin", source: "linkedin-watch",
  };
};

// Mutations re-read the state after any await: a poll may have written it in between.
function patchPostings(paths, ids, patch) {
  const wanted = new Set(ids);
  const state = readState(paths);
  writeState(paths, { ...state, postings: state.postings.map((p) => (wanted.has(p.id) ? { ...p, ...patch } : p)) });
}

const idList = (ids) => (Array.isArray(ids) ? ids.map(String) : []);

/** Adds the chosen postings to the pipeline inbox (data/pipeline.md) in one write. */
export async function addPostings(paths, ids, addOffers) {
  const wanted = new Set(idList(ids));
  const found = readState(paths).postings.filter((p) => wanted.has(p.id));
  if (found.length === 0) return { status: 404, body: { error: "Posting not found." } };
  const todo = found.filter((p) => !p.addedToPipeline && !p.applied);
  if (todo.length === 0) return { status: 200, body: { added: 0 } };
  const result = await addOffers(todo.map(toOffer));
  if (result.error) return { status: 500, body: { error: result.error } };
  try {
    recordPosted(paths.postedFile, todo.map((p) => ({ url: p.link, postedAt: estimateOf(p) === null ? "" : new Date(estimateOf(p)).toISOString() })));
  } catch (e) {
    console.error("linkedin-watch: could not record the posted time:", e.message); // the job is in the pipeline either way
  }
  patchPostings(paths, todo.map((p) => p.id), { addedToPipeline: true, acknowledged: true });
  return { status: 200, body: { added: result.added } };
}

export const addPosting = (paths, id, addOffers) => addPostings(paths, [id], addOffers);

/** Marks postings as applied: each becomes an `Applied` tracker row (trackerAdd does the merge). */
export async function markApplied(paths, ids, trackerAdd) {
  const wanted = new Set(idList(ids));
  const found = readState(paths).postings.filter((p) => wanted.has(p.id));
  if (found.length === 0) return { status: 404, body: { error: "Posting not found." } };
  const done = [];
  const failed = [];
  for (const p of found.filter((x) => !x.applied)) {
    const r = await trackerAdd(p);
    if (r.ok) done.push(p.id);
    else failed.push({ id: p.id, title: p.title, error: r.error ?? "failed" });
  }
  if (done.length > 0) patchPostings(paths, done, { applied: true, acknowledged: true });
  return { status: failed.length > 0 && done.length === 0 ? 500 : 200, body: { applied: done.length, failed } };
}

/** Removes postings from the list. Their ids stay in `seen`, so they do not come back as new. */
export function removePostings(paths, ids) {
  const gone = new Set(idList(ids));
  const state = readState(paths);
  const kept = state.postings.filter((p) => !gone.has(p.id));
  writeState(paths, { ...state, postings: kept });
  return { status: 200, body: { removed: state.postings.length - kept.length } };
}
