// Atomic JSON persistence for the LinkedIn watcher (state, status) under .career-ops-web/.
import fs from "node:fs";
import path from "node:path";
import { emptyState } from "./state.mjs";

export function watchPaths(dataRoot) {
  const dir = path.join(dataRoot, ".career-ops-web");
  return {
    dir,
    stateFile: path.join(dir, "linkedin-watch-state.json"),
    statusFile: path.join(dir, "linkedin-watch-status.json"),
    configFile: path.join(dataRoot, "data", "linkedin-watch.yml"),
    originFile: path.join(dataRoot, "data", "scan-origin.tsv"),
    pollLogFile: path.join(dataRoot, "data", "linkedin-watch-polls.tsv"),
  };
}

export function emptyStatus() {
  return {
    state: "stopped",
    haltReason: null,
    lastHeartbeatAt: null,
    lastPollAt: null,
    nextPollAt: null,
    newToday: 0,
    newTodayDate: null,
    consecutiveFailures: 0,
    runNowRequestedAt: null,
    lastNewCount: null,
    lastPages: 1,
    lastRead: null,
    lastBaseline: false,
    pollTimes: [],
  };
}

function readJson(file, fallback) {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    return parsed && typeof parsed === "object" ? { ...fallback, ...parsed } : fallback;
  } catch {
    return fallback;
  }
}

function writeJsonAtomic(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2));
  fs.renameSync(tmp, file);
}

export const readState = (paths) => readJson(paths.stateFile, emptyState());
export const writeState = (paths, state) => writeJsonAtomic(paths.stateFile, state);
export const readStatus = (paths) => readJson(paths.statusFile, emptyStatus());
export const writeStatus = (paths, status) => writeJsonAtomic(paths.statusFile, status);
