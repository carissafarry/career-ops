#!/usr/bin/env node
// career-ops-status.mjs: one screen that answers "is the background work running?"
//
//   node scripts/career-ops-status.mjs
//
// Reads only. It checks the two LaunchAgents, the scan worker's last check, the last
// scan run, the last notification the notifier announced, the scheduled jobs, the
// pipeline size, and whether the dashboard answers on its port. Nothing is changed.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const AGENTS = [
  { label: "io.career-ops.scheduled-scan", what: "Scan worker (checks every 15 minutes)" },
  { label: "io.career-ops.notify", what: "Notifier (checks every 5 minutes)" },
];

/** "3 hours ago" style text, in Indonesian. */
export function ago(isoOrMs, now = Date.now()) {
  const then = typeof isoOrMs === "number" ? isoOrMs : Date.parse(isoOrMs);
  if (!Number.isFinite(then)) return "tidak diketahui";
  const seconds = Math.max(0, Math.round((now - then) / 1000));
  if (seconds < 90) return "baru saja";
  const minutes = Math.round(seconds / 60);
  if (minutes < 90) return `${minutes} menit lalu`;
  const hours = Math.round(minutes / 60);
  if (hours < 36) return `${hours} jam lalu`;
  return `${Math.round(hours / 24)} hari lalu`;
}

/** Parse `launchctl list` output into { label -> { pid, status } }. */
export function parseLaunchctlList(text) {
  const found = {};
  for (const line of String(text ?? "").split("\n")) {
    const [pid, status, label] = line.trim().split(/\s+/);
    if (label) found[label] = { pid: pid === "-" ? null : pid, status: Number.parseInt(status, 10) };
  }
  return found;
}

/** The last row of a TSV as an object keyed by its header, or null. */
export function lastRow(tsv) {
  const lines = String(tsv ?? "").split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return null;
  const header = lines[0].split("\t");
  const cols = lines[lines.length - 1].split("\t");
  return Object.fromEntries(header.map((name, i) => [name, cols[i] ?? ""]));
}

const read = (file) => (existsSync(file) ? readFileSync(file, "utf8") : "");

function portOpen(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host: "127.0.0.1" });
    const done = (ok) => { socket.destroy(); resolve(ok); };
    socket.setTimeout(800);
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false));
  });
}

function jobsFrom(storeText) {
  try {
    const data = JSON.parse(storeText || "null");
    const list = Array.isArray(data) ? data : Array.isArray(data?.jobs) ? data.jobs : [];
    return list;
  } catch {
    return null;
  }
}

async function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const { getCareerOpsRoot } = await import(pathToFileURL(path.join(root, "path-resolver.mjs")).href);
  const { scheduledStorePath } = await import(pathToFileURL(path.join(root, "web/src/lib/scheduled-runner-path.mjs")).href);
  const dataRoot = getCareerOpsRoot();
  const data = (name) => path.join(dataRoot, "data", name);
  const out = [];
  const line = (mark, text) => out.push(`${mark} ${text}`);

  out.push("career-ops: status\n");

  // 1. Background jobs
  let launchd = {};
  try {
    launchd = parseLaunchctlList(execFileSync("launchctl", ["list"], { encoding: "utf8" }));
  } catch {
    out.push("(launchctl tidak bisa dibaca di sistem ini)");
  }
  out.push("Pekerjaan di latar belakang");
  for (const { label, what } of AGENTS) {
    const agent = launchd[label];
    if (!agent) line("✗", `${label}: TIDAK TERPASANG. ${what}`);
    else if (agent.status !== 0) line("⚠", `${label}: terpasang, tapi keluar dengan kode ${agent.status}. Lihat lognya.`);
    else line("✓", `${label}: terpasang. ${what}`);
  }

  // 2. Scan worker's last check
  const store = scheduledStorePath(dataRoot);
  const tick = `${store}.tick`;
  if (existsSync(tick)) {
    const when = statSync(tick).mtimeMs;
    const stale = Date.now() - when > 45 * 60 * 1000;
    line(stale ? "⚠" : "✓", `Worker scan terakhir memeriksa: ${ago(when)}${stale ? " (terlalu lama, harusnya tiap 15 menit)" : ""}`);
  } else {
    line("⚠", "Worker scan belum pernah memeriksa.");
  }

  const jobs = jobsFrom(read(store));
  if (jobs === null) line("⚠", "File pekerjaan terjadwal tidak terbaca.");
  else if (jobs.length === 0) line("⚠", "Belum ada pekerjaan scan terjadwal. Buat satu di menu Scheduled scans.");
  else {
    line("✓", `${jobs.length} pekerjaan scan terjadwal:`);
    for (const job of jobs) {
      const label = job.name || job.id || "(tanpa nama)";
      const on = job.enabled === false ? "mati" : "aktif";
      out.push(`    · ${label} (${on})`);
    }
  }

  // 3. Last scan
  out.push("\nScan terakhir");
  const run = lastRow(read(data("scan-runs.tsv")));
  if (!run?.timestamp) out.push("✗ Belum ada scan tercatat.");
  else {
    line("✓", `${ago(run.timestamp)} (${new Date(run.timestamp).toLocaleString("id-ID")})`);
    out.push(`    · ${Number(run.found || 0).toLocaleString("id-ID")} lowongan diperiksa, ${run.new_added || 0} baru, ${run.dupes || 0} sudah pernah dilihat`);
  }

  // 4. Notifier
  out.push("\nNotifikasi");
  try {
    const state = JSON.parse(read(data(".notify-state.json")) || "{}");
    if (state.lastTimestamp) out.push(`✓ Sudah memeriksa scan sampai: ${ago(state.lastTimestamp)}`);
    else out.push("⚠ Pemeriksa belum mencatat scan apa pun.");
  } catch {
    out.push("⚠ File status notifikasi tidak terbaca.");
  }
  const log = read(data("notify.log")).trim().split("\n").filter(Boolean);
  if (log.length) out.push(`    · log terakhir: ${log[log.length - 1].slice(0, 120)}`);

  // 5. Pipeline and dashboard
  out.push("\nPipeline dan dashboard");
  const pending = (read(data("pipeline.md")).match(/^- \[ \] /gm) ?? []).length;
  line("✓", `${pending} lowongan menunggu di pipeline`);
  const up = await portOpen(3000);
  line(up ? "✓" : "⚠", up ? "Dashboard menyala di http://127.0.0.1:3000" : "Dashboard mati (jalankan: npm run ui)");

  console.log(out.join("\n"));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    console.error(`career-ops-status: ${error.message}`);
    process.exit(1);
  });
}
