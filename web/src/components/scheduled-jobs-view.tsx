"use client";

import { useEffect, useState } from "react";
import {
  CalendarClock,
  CalendarPlus,
  CheckCircle2,
  Clock,
  History,
  Layers,
  Loader2,
  RefreshCw,
  Search,
  Sparkles,
  Zap,
} from "lucide-react";
import { pageFrameWidthClass } from "@/components/page-frame";
import { scanSuccessLabel } from "@/lib/scan-success.mjs";
import { EMPTY_SCHEDULES_HINT, SCHEDULED_SCANS_INTRO } from "@/lib/schedule-label.mjs";
import { CreateJobModal } from "./scheduled-scans/create-job-modal";
import { EditJobModal } from "./scheduled-scans/edit-job-modal";
import { JobCard } from "./scheduled-scans/job-card";
import { RunHistoryDrawer } from "./scheduled-scans/run-history-drawer";
import type { ScheduledJob, JobRun } from "@/lib/scheduled-jobs";
import { updateScheduledJobRequest } from "@/lib/scheduled-job-client.mjs";
import { sharedGet } from "@/lib/shared-fetch";
import { scheduledScansBody } from "@/lib/scheduled-scans-phase.mjs";
import { isSchedulerStatusPayload } from "@/lib/scheduled-scheduler-status.mjs";

type Store = { jobs: ScheduledJob[]; runs: JobRun[] };
type SchedulerStatus = {
  platform: "win32" | "darwin" | "linux" | string;
  available: boolean;
  running: boolean;
  task: { exists: boolean; enabled: boolean; nextRun: string | null; lastRun: string | null };
};

function formatTaskTime(value: string | null) {
  if (!value) return "Not reported";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

const OS_SCHEDULERS: Record<string, { title: string; install: string } | undefined> = {
  win32: { title: "Windows Task Scheduler Integration", install: "web/scripts/install-scan-schedule.ps1" },
  darwin: { title: "macOS launchd Integration", install: "sh web/scripts/install-scan-schedule.sh" },
  linux: { title: "Linux cron Integration", install: "sh web/scripts/install-scan-schedule.sh" },
};

export function ScheduledJobsView() {
  const [store, setStore] = useState<Store>({ jobs: [], runs: [] });
  const [scheduler, setScheduler] = useState<SchedulerStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading");
  const [filterTab, setFilterTab] = useState<"all" | "active" | "paused">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [historyDrawerOpen, setHistoryDrawerOpen] = useState(false);
  const [editingJob, setEditingJob] = useState<ScheduledJob | null>(null);
  // A scan being copied, and a counter so each Copy opens a freshly filled form.
  const [copySource, setCopySource] = useState<ScheduledJob | null>(null);
  const [createFormKey, setCreateFormKey] = useState(0);
  const [osRunning, setOsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    setPhase("loading");
    setError(null);
    try {
      const [jobsResponse, schedulerResponse] = await Promise.all([
        sharedGet("/api/scheduled-jobs", { cache: "no-store" }),
        sharedGet("/api/scheduler", { cache: "no-store" }),
      ]);
      const resJobs = await jobsResponse.json().catch(() => ({}));
      const resScheduler = await schedulerResponse.json().catch(() => null);
      if (!jobsResponse.ok) throw new Error(resJobs.error || "Could not load scheduled scans.");
      if (!schedulerResponse.ok && resScheduler?.error) setError(resScheduler.error);
      setStore({
        jobs: Array.isArray(resJobs.jobs) ? resJobs.jobs : [],
        runs: Array.isArray(resJobs.runs) ? resJobs.runs : [],
      });
      if (schedulerResponse.ok && isSchedulerStatusPayload(resScheduler)) setScheduler(resScheduler as SchedulerStatus);
      setPhase("ready");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load scheduled scans.");
      setPhase("error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  // A scan that holds the runner makes Run now fail, and it can start without this page
  // (the OS schedule, another tab). So the page asks again every few seconds, quietly, and
  // shows when one is running. Nothing here shows the loading state or clears an error.
  useEffect(() => {
    let alive = true;
    const poll = async () => {
      if (document.hidden) return;
      try {
        const [jobsResponse, schedulerResponse] = await Promise.all([
          fetch("/api/scheduled-jobs", { cache: "no-store" }),
          fetch("/api/scheduler", { cache: "no-store" }),
        ]);
        if (!alive) return;
        if (jobsResponse.ok) {
          const body = await jobsResponse.json().catch(() => null);
          if (alive && body) setStore({ jobs: Array.isArray(body.jobs) ? body.jobs : [], runs: Array.isArray(body.runs) ? body.runs : [] });
        }
        if (schedulerResponse.ok) {
          const body = await schedulerResponse.json().catch(() => null);
          if (alive && isSchedulerStatusPayload(body)) setScheduler(body as SchedulerStatus);
        }
      } catch {
        /* the next poll tries again */
      }
    };
    const timer = window.setInterval(() => void poll(), 6000);
    const onVisible = () => void poll();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  const handleToggleStatus = async (id: string, currentStatus: string) => {
    const nextStatus = currentStatus === "active" ? "paused" : "active";
    try {
      await updateScheduledJobRequest(id, { status: nextStatus });
      await loadData();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update scheduled scan.");
    }
  };

  // A new scan starts from a blank form, not from the last copy that was opened.
  const openNewScan = () => {
    setCopySource(null);
    setCreateFormKey((k) => k + 1);
    setCreateModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this scheduled scan?")) return;
    try {
      const response = await fetch(`/api/scheduled-jobs/${id}`, { method: "DELETE" });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setError(body.error || "Could not delete scheduled scan.");
        return;
      }
      await loadData();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not delete scheduled scan.");
    }
  };

  const handleTriggerOsScheduler = async () => {
    setOsRunning(true);
    try {
      const response = await fetch("/api/scheduler", { method: "POST" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Could not start scheduler.");
      await loadData();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not start scheduler.");
    } finally {
      setOsRunning(false);
    }
  };

  const jobsList = store.jobs.filter((j) => j.status !== "deleted");
  const activeJobs = jobsList.filter((j) => j.status === "active");
  const pausedJobs = jobsList.filter((j) => j.status === "paused");

  const filteredJobs = jobsList
    .filter((j) => {
      if (filterTab === "active") return j.status === "active";
      if (filterTab === "paused") return j.status === "paused";
      return true;
    })
    .filter((j) => {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        j.name.toLowerCase().includes(q) ||
        (j.filters?.positive || []).some((kw) => kw.toLowerCase().includes(q))
      );
    });

  const totalRuns = store.runs.length;
  const successRuns = store.runs.filter((r) => r.state === "success").length;
  const failedRuns = store.runs.filter((r) => r.state === "failed").length;
  const totalRolesFound = store.runs.reduce((acc, r) => acc + (r.rolesFound || 0), 0);
  const successRate = scanSuccessLabel(totalRuns, successRuns);

  const osScheduler = scheduler ? OS_SCHEDULERS[scheduler.platform] : undefined;

  // The runner lock says a scan is running; the run list names which job, when it can.
  const runningNames = [...new Set(
    store.runs
      .filter((r) => r.state === "running")
      .map((r) => jobsList.find((j) => j.id === r.jobId)?.name)
      .filter((name): name is string => Boolean(name)),
  )];
  // Only the lock decides: it knows a dead runner is stale, a "running" row in the list does not.
  const scanRunning = scheduler?.running === true;

  return (
    <div className={`mx-auto px-5 py-8 md:px-8 space-y-8 ${pageFrameWidthClass.wide}`}>
      {/* Header matching Explore & Portals format */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-6">
        <div>
          <div className="flex items-center gap-2.5">
            <CalendarClock className="size-6 text-brand-text" />
            <h1 className={`font-display text-3xl text-foreground`}>Scheduled scans</h1>
          </div>
          <p className="mt-1.5 max-w-2xl text-sm text-muted">
            {SCHEDULED_SCANS_INTRO}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={openNewScan}
            className="inline-flex items-center gap-2 rounded-full bg-brand px-4 py-2 text-sm font-medium text-brand-foreground transition-colors hover:bg-brand-200"
          >
            <CalendarPlus className="size-4" />
            New scheduled scan
          </button>
          <button
            type="button"
            onClick={() => setHistoryDrawerOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface/60 px-3.5 py-2 text-sm font-medium text-foreground transition-colors hover:bg-surface-hover"
          >
            <History className="size-4 text-brand-text" />
            Run logs ({store.runs.length})
          </button>
          <button
            type="button"
            onClick={loadData}
            disabled={loading}
            className="inline-flex size-9 items-center justify-center rounded-full border border-border bg-surface/60 text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
            title="Refresh list"
          >
            <RefreshCw className={`size-4 ${loading ? "animate-spin text-brand-text" : ""}`} />
          </button>
        </div>
      </div>
      {error && <div role="alert" className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-600 dark:text-rose-400">{error}</div>}
      {scanRunning && (
        <div role="status" className="flex items-start gap-2.5 rounded-xl border border-brand/40 bg-brand-soft p-3 text-sm text-foreground">
          <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin text-brand-text" />
          <p>
            <span className="font-semibold">A scan is running now{runningNames.length ? `: ${runningNames.join(", ")}` : ""}.</span>{" "}
            <span className="text-muted">Run now is paused until it finishes, because a second scan would fail. This page checks every few seconds.</span>
          </p>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid gap-3.5 sm:grid-cols-4">
        <StatCard label="Active scans" value={activeJobs.length} subtitle={`${jobsList.length} total jobs`} icon={<Zap className="size-4 text-emerald-500" />} />
        <StatCard label="Executed runs" value={totalRuns} subtitle={`${successRuns} successful`} icon={<Layers className="size-4 text-brand-text" />} />
        <StatCard label="Roles discovered" value={totalRolesFound} subtitle="Pushed to pipeline" icon={<Sparkles className="size-4 text-amber-500" />} />
        <StatCard label="Success rate" value={successRate} subtitle={`${failedRuns} failed runs`} icon={<CheckCircle2 className="size-4 text-emerald-500" />} />
      </div>

      {/* OS Task Scheduler Banner */}
      {scheduler && (
        <div className="co-rise rounded-2xl border border-border bg-surface shadow-card p-4 shadow-sm backdrop-blur-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="grid size-9 place-items-center rounded-xl bg-surface-hover text-brand-text">
                <Clock className="size-5" />
              </div>
              <div>
                <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  {osScheduler?.title ?? "Manual scans"}
                  <span
                    className={
                      scheduler.task.exists && scheduler.task.enabled
                        ? "rounded bg-emerald-500/15 px-2 py-0.5 text-xs font-semibold text-emerald-800 dark:text-emerald-400"
                        : "rounded bg-amber-500/15 px-2 py-0.5 text-xs font-semibold text-amber-800 dark:text-amber-300"
                    }
                  >
                    {!osScheduler
                      ? "No automatic schedule"
                      : scheduler.task.exists
                        ? scheduler.task.enabled ? "Task enabled" : "Task disabled"
                        : "Task not installed"}
                  </span>
                </div>
                <div className="mt-0.5 text-xs text-muted">
                  {!osScheduler
                    ? "Automatic scheduling is not available on this platform."
                    : scheduler.task.exists
                      ? "Next OS check: " + formatTaskTime(scheduler.task.nextRun) + " · Last OS check: " + formatTaskTime(scheduler.task.lastRun)
                      : `Install with ${osScheduler.install} to run due jobs automatically.`}
                </div>
              </div>
            </div>
            {osScheduler && <button
              type="button"
              onClick={handleTriggerOsScheduler}
              disabled={osRunning || scheduler.running || !scheduler.available}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-surface-hover disabled:opacity-50"
            >
              {osRunning ? <Loader2 className="size-3.5 animate-spin text-brand-text" /> : <Zap className="size-3.5 text-brand-text" />}
              {osRunning ? "Checking..." : "Check due jobs now"}
            </button>}
          </div>
        </div>
      )}

      {/* Filter Tabs & Search */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 rounded-full border border-border bg-surface/60 p-1">
          <button
            type="button"
            onClick={() => setFilterTab("all")}
            className={`rounded-full px-3.5 py-1 text-xs font-medium transition-colors ${
              filterTab === "all" ? "bg-brand text-brand-foreground shadow" : "text-muted hover:text-foreground"
            }`}
          >
            All scans ({jobsList.length})
          </button>
          <button
            type="button"
            onClick={() => setFilterTab("active")}
            className={`rounded-full px-3.5 py-1 text-xs font-medium transition-colors ${
              filterTab === "active" ? "bg-brand text-brand-foreground shadow" : "text-muted hover:text-foreground"
            }`}
          >
            Active ({activeJobs.length})
          </button>
          <button
            type="button"
            onClick={() => setFilterTab("paused")}
            className={`rounded-full px-3.5 py-1 text-xs font-medium transition-colors ${
              filterTab === "paused" ? "bg-brand text-brand-foreground shadow" : "text-muted hover:text-foreground"
            }`}
          >
            Paused ({pausedJobs.length})
          </button>
        </div>

        <div className="relative min-w-[200px]">
          <Search className="absolute left-3 top-2.5 size-3.5 text-faint" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search scans or keywords…"
            className="w-full rounded-full border border-border bg-surface/60 pl-8 pr-3 py-1.5 text-xs text-foreground outline-none focus:border-brand/60"
          />
        </div>
      </div>

      {/* Jobs Grid */}
      {scheduledScansBody(phase, store.jobs.length) === "loading" ? (
        <p role="status" className="rounded-2xl border border-dashed border-border p-12 text-center text-sm text-muted">Loading scheduled scans…</p>
      ) : scheduledScansBody(phase, store.jobs.length) === "error" ? null : filteredJobs.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-12 text-center">
          <CalendarClock className="mx-auto size-8 text-faint" />
          <h2 className="mt-3 text-sm font-semibold text-foreground">No scheduled scans found</h2>
          <p className="mt-1 text-xs text-muted">{EMPTY_SCHEDULES_HINT}</p>
          <button
            type="button"
            onClick={openNewScan}
            className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-brand px-4 py-2 text-xs font-medium text-brand-foreground transition-colors hover:bg-brand-200"
          >
            <CalendarPlus className="size-3.5" /> New scheduled scan
          </button>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filteredJobs.map((job) => (
            <JobCard
              key={job.id}
              job={job}
              onToggleStatus={handleToggleStatus}
              onEdit={(j) => setEditingJob(j)}
              onCopy={(j) => {
                setCopySource(j);
                setCreateFormKey((k) => k + 1);
                setCreateModalOpen(true);
              }}
              onDelete={handleDelete}
              onRunFinished={loadData}
              scanRunning={scanRunning}
              runningHere={store.runs.some((r) => r.state === "running" && r.jobId === job.id)}
            />
          ))}
        </div>
      )}

      {/* Create Modal, Edit Modal & History Drawer */}
      <CreateJobModal
        key={createFormKey}
        isOpen={createModalOpen}
        template={copySource}
        onClose={() => {
          setCreateModalOpen(false);
          setCopySource(null);
        }}
        onCreated={loadData}
      />

      <EditJobModal
        job={editingJob}
        isOpen={!!editingJob}
        onClose={() => setEditingJob(null)}
        onUpdated={loadData}
      />

      <RunHistoryDrawer
        isOpen={historyDrawerOpen}
        onClose={() => setHistoryDrawerOpen(false)}
        runs={store.runs}
      />
    </div>
  );
}

function StatCard({
  label,
  value,
  subtitle,
  icon,
}: {
  label: string;
  value: string | number;
  subtitle: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="co-rise flex items-center justify-between rounded-xl border border-border bg-surface shadow-card p-4 shadow-sm transition-colors hover:border-brand/30">
      <div>
        <span className="text-xs font-medium text-muted">{label}</span>
        <div className="mt-1 text-2xl font-bold tracking-tight text-foreground">{value}</div>
        <div className="mt-0.5 text-xs text-faint">{subtitle}</div>
      </div>
      <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand-text">
        {icon}
      </div>
    </div>
  );
}
