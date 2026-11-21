"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { LinkedInIcon } from "@/components/icons/linkedin-icon";
import { Bell, ChevronDown, CircleCheck, Info, ListPlus, Loader2, OctagonAlert, Trash2, TriangleAlert } from "lucide-react";
import { pageFrameWidthClass } from "@/components/page-frame";
import { RegionTemplates } from "@/components/country-templates";
import { byPostedNewest, postedAgeNow } from "@/lib/linkedin-watch/posted-age.mjs";

type Posting = {
  id: string; title: string; company: string; location: string; link: string;
  postedText: string; firstSeen: string; addedToPipeline?: boolean; acknowledged?: boolean; notified?: boolean; baseline?: boolean; scanId?: string; applied?: boolean;
};
type Status = {
  state: "running" | "stopped" | "halted"; haltReason: string | null; lastHeartbeatAt: string | null;
  lastPollAt: string | null; nextPollAt: string | null; newToday: number; runNowRequestedAt?: string | null; lastCardCount?: number; lastKeptCount?: number; lastNewCount?: number | null; lastPages?: number; lastRead?: { requested: number; version: string | null; stop: string | null; pager: string[]; stopDiag?: { page: number | null; urlAfter: string | null; cardsNow: number | null } | null } | null; lastBaseline?: boolean; filterError?: string | null;
};
type LastPoll = { startedAt: string; read: number; kept: number; added: number; baseline: boolean };
type Overview = { config: Record<string, unknown>; status: Status; postings: Posting[]; baselineAt: string | null; knownCount: number; lastPoll: LastPoll | null; searches?: SavedSearch[] };
type SavedSearch = { id: string; name: string; url: string; active: boolean; count: number };

const HALT_TEXT: Record<string, string> = {
  "login-wall": "LinkedIn asked you to log in again.",
  captcha: "LinkedIn showed a security check.",
  checkpoint: "LinkedIn opened a checkpoint.",
  "rate-limited": "LinkedIn answered 429 (too many requests).",
  "no-results": "No job cards could be read twice in a row (layout changed, or the window did not render).",
};

const ago = (iso: string | null) => {
  if (!iso) return "never";
  const min = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
  return min < 1 ? "just now" : min < 60 ? `${min} min ago` : `${Math.round(min / 60)} h ago`;
};
// 24-hour HH:MM: short enough to stay on one line inside a stat tile.
const clock = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false }) : "-");
const at = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "-");

const FILTER_FIELDS = [
  { key: "positive", label: "Title must match one of", hint: "Empty = any title" },
  { key: "negative", label: "Exclude titles containing", hint: "e.g. Senior, Lead, Intern" },
  { key: "allow", label: "Location must match one of", hint: "Empty = any location" },
  { key: "block", label: "Exclude locations", hint: "e.g. India" },
  { key: "blockHard", label: "Always exclude locations", hint: "Wins over everything below" },
  { key: "alwaysAllow", label: "Always allow locations", hint: "Wins over Exclude" },
] as const;
type FilterKey = (typeof FILTER_FIELDS)[number]["key"];
type FilterText = Record<FilterKey, string>;
type ScheduledJob = { name: string; filters?: Partial<Record<FilterKey, string[]>> };

const emptyFilterText = (): FilterText => ({ positive: "", negative: "", allow: "", block: "", blockHard: "", alwaysAllow: "" });
// One entry per line in the form; the saved config (like a scheduled scan) keeps real lists.
function filtersToText(filters: Partial<Record<FilterKey, string[]>> | undefined): FilterText {
  const out = emptyFilterText();
  for (const { key } of FILTER_FIELDS) out[key] = (filters?.[key] ?? []).join("\n");
  return out;
}
function textToFilters(text: FilterText): Record<FilterKey, string[]> {
  const out = {} as Record<FilterKey, string[]>;
  for (const { key } of FILTER_FIELDS) out[key] = text[key].split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  return out;
}

const FILTERS_OPEN_KEY = "career-ops:linkedin-filters-open";
const SEARCHES_OPEN_KEY = "career-ops:linkedin-searches-open";

type Notice = { tone: "info" | "warn" | "error"; title: string; body: string };

const NOTICE_STYLE = {
  info: { box: "border-brand/40 bg-brand-soft", icon: "text-brand-text", Icon: Info },
  warn: { box: "border-amber-500/50 bg-amber-500/10", icon: "text-amber-800 dark:text-amber-300", Icon: TriangleAlert },
  error: { box: "border-red-500/50 bg-red-500/10", icon: "text-red-700 dark:text-red-300", Icon: OctagonAlert },
} as const;

// The "this folds" hint for a <details> summary: Show/Hide and an arrow that turns when it is open.
// The parent <details> needs the `group` class.
function FoldHint() {
  return (
    <span className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-full border border-border px-2 py-0.5 text-xs text-muted group-hover:text-foreground">
      <span className="group-open:hidden">Show</span>
      <span className="hidden group-open:inline">Hide</span>
      <ChevronDown className="size-3.5 transition-transform group-open:rotate-180" aria-hidden="true" />
    </span>
  );
}

// One number with its label, so the poll result reads as a row of facts instead of a sentence.
function Stat({ label, value, hint, accent = false }: { label: string; value: string | number; hint?: string; accent?: boolean }) {
  return (
    <div className="rounded-lg border border-border bg-background px-3 py-2.5">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className={`mt-0.5 whitespace-nowrap text-2xl font-semibold tabular-nums leading-tight ${accent ? "text-brand-text" : "text-foreground"}`}>{value}</dd>
      {hint && <p className="mt-0.5 text-[11px] text-faint">{hint}</p>}
    </div>
  );
}

// One card per message, so each is readable on its own instead of a pile of small grey lines.
function NoticeCard({ notice }: { notice: Notice }) {
  const { box, icon, Icon } = NOTICE_STYLE[notice.tone];
  return (
    <div role={notice.tone === "info" ? "status" : "alert"} className={`flex items-start gap-3 rounded-xl border p-4 ${box}`}>
      <Icon className={`mt-0.5 size-5 shrink-0 ${icon}`} aria-hidden="true" />
      <div className="min-w-0">
        <p className="text-sm font-semibold text-foreground">{notice.title}</p>
        <p className="mt-0.5 text-sm text-muted">{notice.body}</p>
      </div>
    </div>
  );
}

// A posting that triggered a notification and is still unseen gets the loudest row; baseline rows only a light tint.
function rowStyle(p: Posting): string {
  if (p.acknowledged) return "border-border bg-surface";
  if (p.notified) return "border-brand border-l-[6px] bg-brand-soft ring-2 ring-brand/40";
  return "border-brand/30 bg-brand-soft/40";
}

export function LinkedInWatchView() {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState("");
  const [interval, setIntervalMin] = useState("10");
  const [hours, setHours] = useState("");
  const [dirty, setDirty] = useState(false);
  const [pagesPerPoll, setPagesPerPoll] = useState("1");
  const [deepPages, setDeepPages] = useState("5");
  const [filters, setFilters] = useState<FilterText>(emptyFilterText());
  // "Ignore jobs older than": a number and a unit; the app stores it as hours.
  const [maxAge, setMaxAge] = useState("");
  const [maxAgeUnit, setMaxAgeUnit] = useState<"hours" | "days">("hours");
  const [scheduled, setScheduled] = useState<ScheduledJob[]>([]);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [searchName, setSearchName] = useState("");
  const [editing, setEditing] = useState<{ id: string; url: string } | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  // Open/closed is a per-browser preference, remembered across refreshes (closed until you open it).
  // The browser owns the element's open state: React must not control `open`, or a re-render can
  // overwrite a click before its toggle event is handled.
  const filtersRef = useRef<HTMLDetailsElement>(null);
  const searchesRef = useRef<HTMLDetailsElement>(null); // Saved URLs: open until you close it, then remembered

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/linkedin-watch", { cache: "no-store" });
      const next = (await res.json()) as Overview;
      setData(next);
      setUpdatedAt(Date.now());
      if (!dirty) {
        setUrl(String(next.config.search_url ?? ""));
        setIntervalMin(String(next.config.interval_minutes ?? 10));
        setHours(String(next.config.active_hours ?? ""));
        setPagesPerPoll(String(next.config.pages_per_poll ?? 1));
        setDeepPages(String(next.config.deep_pages ?? 5));
        setFilters(filtersToText(next.config.filters as Partial<Record<FilterKey, string[]>> | undefined));
        const hours = Number(next.config.max_age_hours);
        if (Number.isInteger(hours) && hours > 0) {
          const inDays = hours >= 24 && hours % 24 === 0;
          setMaxAge(String(inDays ? hours / 24 : hours));
          setMaxAgeUnit(inDays ? "days" : "hours");
        } else {
          setMaxAge("");
        }
      }
    } catch {
      setError("Could not reach the app.");
    }
  }, [dirty]);

  useEffect(() => {
    fetch("/api/scheduled-jobs", { cache: "no-store" })
      .then((r) => r.json())
      .then((store) => setScheduled((store.jobs ?? []).filter((j: ScheduledJob) => j.filters)))
      .catch(() => {});
  }, []);

  useEffect(() => {
    try {
      if (window.localStorage.getItem(FILTERS_OPEN_KEY) === "1" && filtersRef.current) filtersRef.current.open = true;
      if (searchesRef.current) searchesRef.current.open = window.localStorage.getItem(SEARCHES_OPEN_KEY) !== "0";
    } catch {
      // storage blocked: the section simply starts closed
      if (searchesRef.current) searchesRef.current.open = true;
    }
  }, []);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  useEffect(() => {
    load();
    const refresh = () => { if (document.visibilityState === "visible") load(); };
    const t = setInterval(refresh, 10000);
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [load]);

  async function post(path: string, body: unknown) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const json = await res.json();
      if (!res.ok) setError(json.error ?? "Something went wrong.");
      return res.ok;
    } finally {
      setBusy(false);
      await load();
    }
  }

  async function save(nextFilters: FilterText = filters) {
    const ok = await post("/api/linkedin-watch", {
      action: "save-config", search_url: url.trim(), interval_minutes: Number(interval), active_hours: hours.trim(), pages_per_poll: Number(pagesPerPoll), deep_pages: Number(deepPages), max_age_hours: maxAge.trim() === "" ? "" : Number(maxAge) * (maxAgeUnit === "days" ? 24 : 1), filters: textToFilters(nextFilters),
    });
    if (ok) { setDirty(false); setSavedAt(Date.now()); }
    return ok;
  }

  // Saved URLs: the URL is kept under a name; each search keeps its own list, so switching loses nothing.
  async function saveSearchName() {
    if (await post("/api/linkedin-watch", { action: "save-search", name: searchName })) setSearchName("");
  }
  async function useSearch(id: string) {
    if (dirty && !window.confirm("You have unsaved changes on this page. Switch searches anyway? The changes are lost.")) return;
    setDirty(false);
    await post("/api/linkedin-watch", { action: "use-search", id });
  }
  // Changes the URL of a saved URLs in place: same name, same list of jobs.
  async function saveEditedUrl() {
    if (!editing) return;
    if (await post("/api/linkedin-watch", { action: "update-search", id: editing.id, url: editing.url.trim() })) setEditing(null);
  }
  async function deleteSearch(found: SavedSearch) {
    if (!window.confirm(`Remove "${found.name}" from your saved URLs? Its list of jobs is kept and returns if you use the same URL again.`)) return;
    await post("/api/linkedin-watch", { action: "delete-search", id: found.id });
  }

  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Newest first by the time LinkedIn shows ("14 hours ago", read against when the watcher saw it), or by when the watcher first saw it.
  const [sortBy, setSortBy] = useState<"posted" | "seen">("posted");
  // The age on each row is counted from LinkedIn's age at the time it was read, so it keeps moving while the page stays open.
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNowMs(Date.now()), 60_000);
    return () => window.clearInterval(t);
  }, []);
  const rawPostings = data?.postings ?? [];
  const postings = sortBy === "posted" ? [...rawPostings].sort(byPostedNewest) : rawPostings;
  const allSelected = postings.length > 0 && postings.every((p) => selected.has(p.id));
  const toggleOne = (id: string) => setSelected((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(postings.map((p) => p.id)));

  // pipeline: the inbox (data/pipeline.md). applied: an "Applied" row in the tracker. delete: off this list only.
  async function act(kind: "pipeline" | "applied" | "delete", ids: string[]) {
    if (ids.length === 0) return;
    if (kind === "applied" && !window.confirm(`Mark ${ids.length === 1 ? "this job" : `${ids.length} jobs`} as applied and add ${ids.length === 1 ? "it" : "them"} to your tracker?`)) return;
    if (kind === "delete" && ids.length > 1 && !window.confirm(`Delete ${ids.length} postings from this list?`)) return;
    setBusy(true);
    setError(null);
    try {
      const [path, body] = kind === "pipeline" ? ["/api/linkedin-watch/add", { ids }] : kind === "applied" ? ["/api/linkedin-watch/applied", { ids }] : ["/api/linkedin-watch", { action: "remove", ids }];
      const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const json = await res.json();
      if (!res.ok) setError(json.error ?? json.failed?.[0]?.error ?? "Something went wrong.");
      else if (json.failed?.length) setError(`${json.failed.length} could not be added to the tracker: ${json.failed[0].error}`);
      setSelected((prev) => { const next = new Set(prev); ids.forEach((id) => next.delete(id)); return next; });
    } finally {
      setBusy(false);
      await load();
    }
  }

  const status = data?.status;
  const lastPoll = data?.lastPoll && status?.lastPollAt && data.lastPoll.startedAt === status.lastPollAt ? data.lastPoll : null;
  const lastIsBaseline = status?.lastBaseline ?? lastPoll?.baseline ?? false;
  const lastNew: number | null = status?.lastNewCount ?? (lastPoll && !lastPoll.baseline ? lastPoll.added : null);
  const notifiedUnseen = data?.postings.filter((p) => p.notified && !p.acknowledged).length ?? 0;
  const unseen = data?.postings.filter((p) => !p.acknowledged).length ?? 0;
  const intervalMin = Number(data?.config.interval_minutes ?? 10);
  const jitter = Number(data?.config.jitter_percent ?? 30);
  const silentAfterMs = 2 * intervalMin * 60000 * (1 + jitter / 100) + 60000;
  const silent = status?.state === "running" && (!status.lastHeartbeatAt || Date.now() - Date.parse(status.lastHeartbeatAt) > silentAfterMs);

  const notices: Notice[] = [];
  if (status?.state === "halted") {
    notices.push({ tone: "error", title: "Watcher stopped by a safety rule", body: `${HALT_TEXT[status.haltReason ?? ""] ?? "Stopped."} Fix it in LinkedIn, then press Resume.` });
  }
  if (silent && !status?.lastHeartbeatAt) {
    notices.push({ tone: "warn", title: "Waiting for the extension's first check-in", body: "This can take up to 2 minutes. If nothing arrives, see the troubleshooting in the extension README." });
  }
  if (silent && status?.lastHeartbeatAt) {
    notices.push({ tone: "warn", title: "Extension silent", body: `Chrome may be closed, or the watcher window was closed. Last heard ${ago(status.lastHeartbeatAt)}.` });
  }
  if (typeof data?.config.search_url === "string" && !/sortBy=DD/.test(data.config.search_url)) {
    notices.push({ tone: "warn", title: "Sort by Most recent is missing", body: 'Your URL has no "sort by most recent" (sortBy=DD). New jobs may rank below the first 25 and be missed. Pick Most recent in LinkedIn and save the URL again.' });
  }
  const read = status?.lastRead;
  const gotPages = status?.lastPages ?? 1;
  if (status?.lastPollAt && read && gotPages < read.requested) {
    const title = `Only ${gotPages} of ${read.requested} pages were read`;
    if (read.version === null && (status.lastCardCount ?? 0) === 0) {
      // No cards and no answer from the page script: usually LinkedIn never loaded (no internet, a DNS error, a login page,
      // a closed window), so this must not blame the extension's version.
      notices.push({ tone: "warn", title, body: "The LinkedIn page did not answer and no jobs were read. LinkedIn may not have loaded: check your internet connection, and that your saved URL opens normally in Chrome (not a login page or an error page). If it opens fine, click Reload on the LinkedIn watcher at chrome://extensions, then press Run now. This message goes away after a poll that reads jobs." });
    } else if (read.version === null) {
      notices.push({ tone: "warn", title, body: "The extension sent no page information, so it is most likely still an old version. Open chrome://extensions, click Reload on the LinkedIn watcher, and check that its version says 0.4.1 or newer." });
    } else if (read.stop === "last-page" || (read.stop === "no-new-cards" && (read.stopDiag?.cardsNow === 0 || (status.lastCardCount ?? 0) < 25 * gotPages))) {
      // A short page, or a next page with no jobs on it, is just the end of the results: nothing to tell.
    } else if (read.stop === "no-new-cards") {
      const d = read.stopDiag;
      const detail = d ? ` Page ${d.page ?? gotPages + 1} loaded as ${d.urlAfter ?? "an unknown address"} and showed ${d.cardsNow ?? "?"} jobs.` : "";
      notices.push({ tone: "warn", title, body: `Page ${gotPages + 1} showed no job that had not already been read, so reading stopped. LinkedIn may have shown the same page again.${detail}` });
    } else if (read.stop === "no-cards") {
      notices.push({ tone: "warn", title, body: "No jobs could be read on the page, so no further page was loaded." });
    } else if (read.stop === "left-results") {
      notices.push({ tone: "warn", title, body: "LinkedIn left the results page while loading the next page (a login or checkpoint page). The watcher will stop if it was one." });
    }
  }
  if (status?.filterError) {
    notices.push({ tone: "warn", title: "Filters could not be applied", body: `${status.filterError}. Until it is fixed, every job is shown unfiltered.` });
  }
  if (data?.baselineAt) {
    notices.push({ tone: "info", title: `Tracking ${data.knownCount} known postings`, body: `Since ${at(data.baselineAt)}. Only jobs outside this list count as new.` });
  } else if (data && status?.state === "running") {
    notices.push({ tone: "info", title: "No baseline yet", body: "The first successful poll records the current list. It is listed as new, without a notification." });
  }

  return (
    <div className={`mx-auto space-y-8 px-5 pb-28 pt-8 md:px-8 ${pageFrameWidthClass.wide}`}>
      <div className="border-b border-border pb-5">
        <div className="flex items-center gap-2.5">
          <LinkedInIcon className="size-6 text-brand-text" />
          <h1 className="font-display text-3xl text-foreground">LinkedIn</h1>
        </div>
        <div className="mt-1.5 max-w-2xl text-sm text-muted">
          A Chrome extension reloads your saved LinkedIn search at random intervals.
        </div>
        <div className="mt-1.5 max-w-2xl text-sm text-muted">
          New postings appear here and trigger a macOS notification.
        </div>
        <div className="mt-1.5 max-w-2xl text-sm text-muted">
          Install steps: <code>web/extensions/linkedin-watch/README.md</code>.
        </div>
      </div>

      {error && <p role="alert" className="rounded-lg border border-border bg-surface p-3 text-sm text-foreground">{error}</p>}

      {notices.length > 0 && (
        <div className="space-y-3" aria-label="Watcher notices">
          {notices.map((n) => <NoticeCard key={n.title} notice={n} />)}
        </div>
      )}

      <section className="divide-y divide-border rounded-xl border border-border bg-surface shadow-card">
        <div className="space-y-3 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 space-y-1.5">
              <span className="inline-flex items-center gap-2 rounded-full border border-border px-2.5 py-1 text-xs font-medium text-foreground">
                <span className={`size-2 rounded-full ${!status ? "bg-border" : status.state === "running" ? "bg-emerald-500" : status.state === "halted" ? "bg-red-500" : "bg-border"}`} aria-hidden="true" />
                {!status ? "Loading..." : status.state === "running" ? "Watching" : status.state === "halted" ? "Stopped by a safety rule" : "Off"}
              </span>
              {status && status.lastPollAt && (
                <>
                  <p className={`text-xl font-semibold leading-snug ${lastNew != null && lastNew > 0 && !lastIsBaseline ? "text-brand-text" : "text-foreground"}`}>
                    {lastIsBaseline ? `First scan: ${lastPoll?.kept ?? status.lastKeptCount ?? 0} jobs listed` : lastNew == null ? "Waiting for a poll result" : lastNew === 0 ? "No new jobs in the last poll" : `${lastNew} new ${lastNew === 1 ? "job" : "jobs"} in the last poll`}
                  </p>
                  <p className="text-sm text-muted">
                    Last poll {ago(status.lastPollAt)}
                    {updatedAt ? <span className="text-faint"> · live, updated {new Date(updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span> : null}
                  </p>
                </>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
            {status?.state === "halted" && <button disabled={busy} onClick={() => post("/api/linkedin-watch", { action: "resume" })} className="rounded-full bg-brand px-4 py-2 text-sm font-medium text-white">Resume</button>}
            {status?.state === "stopped" && <button disabled={busy} onClick={() => post("/api/linkedin-watch", { action: "enable" })} className="rounded-full bg-brand px-4 py-2 text-sm font-medium text-white">Enable</button>}
            {status?.state === "running" && <button disabled={busy || Boolean(status.runNowRequestedAt)} onClick={() => post("/api/linkedin-watch", { action: "run-now" })} className="rounded-full bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-60">{status.runNowRequestedAt ? "Waiting for extension..." : "Run now"}</button>}
            {status?.state === "running" && <button disabled={busy} onClick={() => post("/api/linkedin-watch", { action: "disable" })} className="rounded-full border border-border px-4 py-2 text-sm text-foreground">Disable</button>}
          </div>
          </div>
        </div>

        {status && status.lastPollAt && status.lastCardCount != null && (() => {
          const kept = status.lastKeptCount ?? status.lastCardCount;
          const pages = status.lastPages ?? 1;
          return (
            <div className="space-y-2 p-4">
              <dl className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 lg:grid-cols-7">
                <Stat label="Read" value={status.lastCardCount} hint={`on ${pages} ${pages === 1 ? "page" : "pages"}`} />
                <Stat label="Match filters" value={kept} hint="on the page" />
                <Stat label="New" value={lastIsBaseline ? "-" : lastNew ?? "-"} hint="never seen before" accent={!lastIsBaseline && (lastNew ?? 0) > 0} />
                <Stat label="Already seen" value={lastIsBaseline || lastNew == null ? "-" : Math.max(kept - lastNew, 0)} hint="not counted as new" />
                <Stat label="Your list" value={postings.length} hint="after your deletes" />
                <Stat label="New today" value={status.newToday} hint="all polls" />
                <Stat label="Next poll" value={clock(status.nextPollAt)} hint="about, randomised" />
              </dl>
              <p className="text-xs text-faint">&quot;Match&quot; counts jobs on the LinkedIn page, not your list. A job you delete or apply to stays &quot;seen&quot; and is never counted as new again.</p>
            </div>
          );
        })()}

        <div className="space-y-3 p-4">
        <div className="grid gap-3 md:grid-cols-[1fr_8rem_9rem_auto] md:items-end">
          <label className="text-xs text-muted">Search URL (filters set in LinkedIn)
            <input value={url} onChange={(e) => { setUrl(e.target.value); setDirty(true); }} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground" placeholder="https://www.linkedin.com/jobs/search/?..." />
          </label>
          <label className="text-xs text-muted">Interval (min, 5+)
            <input value={interval} inputMode="numeric" onChange={(e) => { setIntervalMin(e.target.value); setDirty(true); }} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground" />
          </label>
          <label className="text-xs text-muted">Active hours
            <input value={hours} onChange={(e) => { setHours(e.target.value); setDirty(true); }} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground" placeholder="08:00-23:00" />
          </label>
          <button disabled={busy || !dirty} onClick={() => save()} className="rounded-full border border-border px-4 py-2 text-sm text-foreground disabled:opacity-50">
            {busy ? <Loader2 className="size-4 animate-spin" /> : "Save"}
          </button>
        </div>

        {(() => {
          const searches = data?.searches ?? [];
          const current = searches.find((x) => x.active);
          return (
            <details
              ref={searchesRef}
              className="group rounded-lg border border-border bg-background p-3"
              onToggle={(e) => {
                try {
                  window.localStorage.setItem(SEARCHES_OPEN_KEY, e.currentTarget.open ? "1" : "0");
                } catch {
                  // storage blocked: the choice just does not persist
                }
              }}
            >
              <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-medium text-foreground">Saved URLs{searches.length > 0 ? ` (${searches.length})` : ""}</span>
                {current
                  ? <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-soft px-2.5 py-1 text-xs font-medium text-brand-text"><CircleCheck className="size-3.5" aria-hidden="true" /> In use: {current.name}</span>
                  : <span className="rounded-full border border-border px-2.5 py-1 text-xs text-muted">In use: this URL has no saved name yet</span>}
                <FoldHint />
              </summary>
              <p className="mt-1 text-xs text-faint">Save the URL above under a name, then paste another one to try. Each search keeps its own list of jobs, so you can come back to this one.</p>
              <div className="mt-2 flex flex-wrap items-end gap-2">
                <label className="text-xs text-muted">{current ? "Rename the one in use" : "Name for this URL"}
                  <input value={searchName} onChange={(e) => setSearchName(e.target.value)} placeholder={current ? current.name : "Backend, 24h"} maxLength={60} className="mt-1 block w-52 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground" />
                </label>
                {searchName.trim() !== "" && searchName.trim() !== current?.name && (
                  <button disabled={busy || dirty} onClick={saveSearchName} title={dirty ? "Press Save first, so the name goes with the URL you see" : undefined} className="rounded-full bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
                    {current ? "Rename" : "Save this URL"}
                  </button>
                )}
              </div>
              {searches.length > 0 && (
                <ul className="mt-3 space-y-1.5">
                  {searches.map((x) => (
                    <li key={x.id} className={`flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center rounded-lg border px-3 py-2 ${x.active ? "border-brand/40 bg-brand-soft/50" : "border-border bg-surface"}`}>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground">{x.name}{x.active && <span className="ml-2 whitespace-nowrap rounded-full bg-brand px-2 py-0.5 text-[11px] font-medium text-white">In use</span>}</p>
                        <p className="text-xs text-muted">{x.count} {x.count === 1 ? "job" : "jobs"} in its list</p>
                        {editing?.id === x.id ? (
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <input value={editing.url} onChange={(e) => setEditing({ id: x.id, url: e.target.value })} aria-label={`URL of ${x.name}`} className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground md:min-w-[24rem]" />
                            <button disabled={busy || !editing.url.trim()} onClick={saveEditedUrl} className="rounded-full bg-brand px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">Save URL</button>
                            <button disabled={busy} onClick={() => setEditing(null)} className="rounded-full border border-border px-3 py-1.5 text-sm text-foreground disabled:opacity-50">Cancel</button>
                          </div>
                        ) : (
                          <p className="mt-0.5 truncate text-xs text-faint" title={x.url}>{x.url}</p>
                        )}
                      </div>
                      {editing?.id !== x.id && (
                        <div className="flex flex-wrap items-center gap-2">
                          {!x.active && <button disabled={busy} onClick={() => useSearch(x.id)} className="rounded-full bg-brand px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">Use</button>}
                          <button disabled={busy} onClick={() => setEditing({ id: x.id, url: x.url })} className="rounded-full border border-border px-3 py-1.5 text-sm text-foreground disabled:opacity-50">Edit URL</button>
                          <button disabled={busy} onClick={() => deleteSearch(x)} className="rounded-full border border-border px-3 py-1.5 text-sm text-foreground disabled:opacity-50">Remove</button>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {dirty && <p className="mt-2 text-xs text-amber-800 dark:text-amber-300">The URL has changes that are not saved yet. Press Save first.</p>}
            </details>
          );
        })()}

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs text-muted">Pages per scheduled poll (1-5)
            <input value={pagesPerPoll} inputMode="numeric" onChange={(e) => { setPagesPerPoll(e.target.value); setDirty(true); }} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground" />
            <span className="mt-1 block text-faint">Each extra page is one more page turn in your LinkedIn session, every poll. With Sort by Most recent, 1 is enough.</span>
          </label>
          <label className="text-xs text-muted">Pages for Run now and the first scan (1-10)
            <input value={deepPages} inputMode="numeric" onChange={(e) => { setDeepPages(e.target.value); setDirty(true); }} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground" />
            <span className="mt-1 block text-faint">Reads up to this many pages, stopping at the last one. Set it to how many pages your search has.</span>
          </label>
        </div>

        <details
          ref={filtersRef}
          className="group rounded-lg border border-border bg-background p-3"
          onToggle={(e) => {
            const open = e.currentTarget.open;
            try {
              window.localStorage.setItem(FILTERS_OPEN_KEY, open ? "1" : "0");
            } catch {
              // storage blocked: the choice just does not persist
            }
          }}
        >
          <summary className="flex cursor-pointer items-center gap-2 text-sm font-medium text-foreground">
            Filters{Object.values(filters).some(Boolean) || maxAge.trim() !== "" ? " (on)" : " (off)"}
            <FoldHint />
          </summary>
          <p className="mt-2 text-xs text-muted">
            Same rules as a scheduled scan, applied to each job&apos;s title and location. The watcher cannot read the job text, so filters on
            experience or salary still happen when you evaluate. Jobs a filter drops are never listed or notified.
          </p>
          {scheduled.length > 0 && (
            <label className="mt-3 block text-xs text-muted">Copy filters from a scheduled scan
              <select
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground md:w-72"
                value=""
                onChange={(e) => {
                  const job = scheduled[Number(e.target.value)];
                  if (job) { const next = filtersToText(job.filters); setFilters(next); setDirty(true); save(next); }
                }}
              >
                <option value="">Choose a scheduled scan...</option>
                {scheduled.map((j, i) => <option key={j.name + i} value={i}>{j.name}</option>)}
              </select>
            </label>
          )}
          <div className="mt-3">
            <span className="text-xs text-muted">Ignore jobs older than <span className="text-faint">· LinkedIn&apos;s date filter in the URL is not always strict, so the age LinkedIn shows is checked again here. Empty = no limit.</span></span>
            <div className="mt-1 flex items-center gap-2">
              <input
                value={maxAge}
                inputMode="numeric"
                aria-label="Ignore jobs older than"
                placeholder="e.g. 24"
                onChange={(e) => { setMaxAge(e.target.value.replace(/\D/g, "")); setDirty(true); }}
                className="w-24 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground"
              />
              <select
                value={maxAgeUnit}
                aria-label="Unit"
                onChange={(e) => { setMaxAgeUnit(e.target.value as "hours" | "days"); setDirty(true); }}
                className="rounded-lg border border-border bg-surface px-2 py-2 text-sm text-foreground"
              >
                <option value="hours">hours</option>
                <option value="days">days</option>
              </select>
              <span className="text-xs text-faint">Older jobs are not listed and do not notify. They still count as seen, so they never come back as new. Jobs already in your list are not removed.</span>
            </div>
          </div>
          <div className="mt-3">
            <span className="text-xs text-muted">Region <span className="text-faint">· fills &quot;Location must match one of&quot; with every country in it</span></span>
            <div className="mt-1">
              <RegionTemplates
                include={filters.allow.split("\n").map((l) => l.trim()).filter(Boolean)}
                exclude={filters.block.split("\n").map((l) => l.trim()).filter(Boolean)}
                onChange={(next) => { setFilters({ ...filters, allow: next.include.join("\n"), block: next.exclude.join("\n") }); setDirty(true); }}
              />
            </div>
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {FILTER_FIELDS.map(({ key, label, hint }) => (
              <label key={key} className="text-xs text-muted">{label} <span className="text-faint">· {hint}</span>
                <textarea
                  rows={4}
                  value={filters[key]}
                  onChange={(e) => { setFilters({ ...filters, [key]: e.target.value }); setDirty(true); }}
                  placeholder="One per line"
                  className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 font-mono text-xs text-foreground"
                />
              </label>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button disabled={busy || !dirty} onClick={() => save()} className="rounded-full bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-50">Save filters</button>
            <span role="status" className="text-xs text-muted">
              {dirty ? "Unsaved changes. Press Save filters, or they are lost on refresh." : savedAt ? "Saved. Filters apply from the next poll." : "Filters shown are the saved ones."}
            </span>
          </div>
          <p className="mt-2 text-xs text-faint">A line like <code>word:Sr</code> matches the whole word only.</p>
        </details>
        </div>
      </section>

      <section className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-xl text-foreground">New postings{unseen > 0 ? ` (${unseen} unseen)` : ""}{notifiedUnseen > 0 ? ` · ${notifiedUnseen} from notifications` : ""}</h2>
          <div className="flex flex-wrap gap-2">
            {unseen > 0 && <button disabled={busy} onClick={() => post("/api/linkedin-watch", { action: "ack" })} className="rounded-full border border-border px-3 py-1.5 text-sm text-foreground">Mark all as seen</button>}
          </div>
        </div>
        {data && postings.length === 0 && <p className="text-sm text-muted">Nothing here yet. The first poll lists what matches your filters.</p>}
        {postings.length > 0 && (
          <div role="toolbar" aria-label="Actions for the selected postings" className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface p-3">
            <label className="inline-flex items-center gap-2 pr-2 text-sm text-foreground">
              <input type="checkbox" checked={allSelected} onChange={toggleAll} className="size-4 accent-[var(--color-brand)]" />
              {selected.size > 0 ? `${selected.size} selected` : "Select all"}
            </label>
            <label className="inline-flex items-center gap-2 pr-2 text-sm text-muted">
              Sort
              <select value={sortBy} onChange={(e) => setSortBy(e.target.value as "posted" | "seen")} className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm text-foreground">
                <option value="posted">Newest posted on LinkedIn</option>
                <option value="seen">Newest seen by the watcher</option>
              </select>
            </label>
            <button disabled={busy || selected.size === 0} onClick={() => act("pipeline", [...selected])} className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1.5 text-sm text-foreground disabled:opacity-50"><ListPlus className="size-3.5" /> Add to pipeline</button>
            <button disabled={busy || selected.size === 0} onClick={() => act("applied", [...selected])} className="inline-flex items-center gap-1 rounded-full bg-brand px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"><CircleCheck className="size-3.5" /> Mark applied</button>
            <button disabled={busy || selected.size === 0} onClick={() => act("delete", [...selected])} className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1.5 text-sm text-foreground disabled:opacity-50"><Trash2 className="size-3.5" /> Delete</button>
          </div>
        )}
        <ul className="space-y-2">
          {postings.map((p) => (
            <li key={p.id} className={`grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-3 gap-y-2.5 rounded-xl border p-3.5 shadow-card sm:flex sm:flex-wrap sm:items-center ${rowStyle(p)}`}>
              <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggleOne(p.id)} aria-label={`Select ${p.title} at ${p.company}`} className="mt-1 size-4 shrink-0 accent-[var(--color-brand)] sm:mt-0" />
              <div className="min-w-0 sm:flex-1">
                <a href={p.link} target="_blank" rel="noreferrer" onClick={() => { if (!p.acknowledged) post("/api/linkedin-watch", { action: "ack", id: p.id }); }} className="group block">
                <p className="flex flex-wrap items-center gap-2 text-[15px] font-medium text-foreground group-hover:text-brand-text group-hover:underline">
                  <span className="min-w-0 break-words">{p.title}</span>
                  {!p.acknowledged && !p.notified && <span className="shrink-0 rounded-full border border-brand/40 px-2 py-0.5 text-[11px] font-semibold text-brand-text">New</span>}
                  {p.notified && <span title="This posting triggered a macOS notification" className="inline-flex shrink-0 items-center gap-1 rounded-full bg-brand-text px-2 py-0.5 text-[11px] font-semibold text-white"><Bell className="size-3" /> Notification</span>}
                  {p.applied && <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-700 px-2 py-0.5 text-[11px] font-semibold text-white"><CircleCheck className="size-3" /> Applied</span>}
                  {p.addedToPipeline && !p.applied && <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-[11px] font-semibold text-muted">In pipeline</span>}
                </p>
                <p className="text-sm text-muted">{p.company}{p.location ? ` · ${p.location}` : ""}{(() => {
                  const age = postedAgeNow(p, nowMs);
                  if (!age && !p.postedText) return null;
                  return <span title={p.postedText ? `LinkedIn showed "${p.postedText}" when the watcher read this job. The age here counts on from that.` : undefined}>{` · ${age ?? p.postedText}`}</span>;
                })()}</p>
                </a>
                <p className="text-xs text-faint">Seen {ago(p.firstSeen)} · may be a repost if you saw it before</p>
              </div>
              <div className="col-start-2 flex flex-wrap items-center gap-2 sm:col-start-auto">
                {!p.applied && !p.addedToPipeline && (
                  <button disabled={busy} onClick={() => act("pipeline", [p.id])} className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1.5 text-sm text-foreground disabled:opacity-50"><ListPlus className="size-3.5" /> Pipeline</button>
                )}
                {!p.applied && (
                  <button disabled={busy} onClick={() => act("applied", [p.id])} className="inline-flex items-center gap-1 rounded-full bg-brand px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"><CircleCheck className="size-3.5" /> Applied</button>
                )}
                <button disabled={busy} onClick={() => act("delete", [p.id])} aria-label={`Delete ${p.title}`} title="Delete from this list" className="inline-flex items-center rounded-full border border-border p-2 text-muted hover:text-foreground disabled:opacity-50"><Trash2 className="size-4" /></button>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
