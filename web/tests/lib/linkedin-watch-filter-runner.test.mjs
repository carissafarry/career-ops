import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runFilterWorker } from "../../src/lib/linkedin-watch/filter-runner.mjs";

const worker = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../src/lib/linkedin-watch/filter-worker.mjs");
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lw-core-"));
const fakeCore = path.join(dir, "scan.mjs");
fs.writeFileSync(fakeCore, `
export const buildTitleFilter = ({ positive, negative }) => (t) => (positive.length === 0 || positive.some((k) => t.includes(k))) && !negative.some((k) => t.includes(k));
export const buildLocationFilter = () => () => true;
`);
const NONE = { positive: [], negative: [], allow: [], block: [], blockHard: [], alwaysAllow: [] };
const card = (id, title) => ({ id, title, location: "Jakarta", link: `https://www.linkedin.com/jobs/view/${id}/` });

test("the worker returns the ids of the cards that pass, using the core it is pointed at", async () => {
  const kept = await runFilterWorker({ workerPath: worker, corePath: fakeCore, filters: { ...NONE, positive: ["Backend"], negative: ["Senior"] }, cards: [card("1", "Backend Engineer"), card("2", "Chef"), card("3", "Senior Backend Engineer")] });
  assert.deepEqual([...kept], ["1"]);
});

test("a core that fails to load is an error, not a silent pass", async () => {
  const broken = path.join(dir, "broken.mjs");
  fs.writeFileSync(broken, 'import { nope } from "./missing-export.mjs";');
  fs.writeFileSync(path.join(dir, "missing-export.mjs"), "export const other = 1;");
  await assert.rejects(() => runFilterWorker({ workerPath: worker, corePath: broken, filters: { ...NONE, positive: ["x"] }, cards: [card("1", "x")] }), /nope|export/);
});

test("a worker that hangs is stopped after the timeout", async () => {
  const hang = path.join(dir, "hang.mjs");
  fs.writeFileSync(hang, "await new Promise(() => setInterval(() => {}, 1000)); export {};");
  await assert.rejects(() => runFilterWorker({ workerPath: worker, corePath: hang, filters: { ...NONE, positive: ["x"] }, cards: [card("1", "x")], timeoutMs: 1500 }), /timed out/);
});
