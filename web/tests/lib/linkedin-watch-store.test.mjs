import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { watchPaths, readState, writeState, readStatus, writeStatus } from "../../src/lib/linkedin-watch/store.mjs";
import { emptyState } from "../../src/lib/linkedin-watch/state.mjs";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "lw-"));

test("missing files give empty defaults", () => {
  const paths = watchPaths(tmp());
  assert.deepEqual(readState(paths), emptyState());
  assert.equal(readStatus(paths).state, "stopped");
});

test("state and status round-trip", () => {
  const paths = watchPaths(tmp());
  const state = { ...emptyState(), baselineAt: "2026-11-19T10:00:00.000Z", seen: { 1: "x" } };
  writeState(paths, state);
  assert.deepEqual(readState(paths), state);
  writeStatus(paths, { ...readStatus(paths), state: "running" });
  assert.equal(readStatus(paths).state, "running");
});

test("a corrupt file falls back to defaults", () => {
  const paths = watchPaths(tmp());
  fs.mkdirSync(paths.dir, { recursive: true });
  fs.writeFileSync(paths.stateFile, "{not json");
  assert.deepEqual(readState(paths), emptyState());
});
