import assert from "node:assert/strict";
import { test } from "node:test";
import { buildMessage, cleanText, newestAdded, unseenRuns } from "../../../scripts/notify-new-roles.mjs";

const RUNS = [
  "timestamp\tstatus\tnew_added",
  "2026-11-17T08:00:00.000Z\tcompleted\t2",
  "2026-11-17T11:00:00.000Z\tcompleted\t0",
  "2026-11-17T14:00:00.000Z\tcompleted\t3",
].join("\n");

test("only runs after the last announced one count, oldest first", () => {
  assert.equal(unseenRuns(RUNS, "").length, 3);
  const runs = unseenRuns(RUNS, "2026-11-17T08:00:00.000Z");
  assert.deepEqual(runs.map((r) => r.added), [0, 3]);
  assert.deepEqual(unseenRuns(RUNS, "2026-11-17T14:00:00.000Z"), []);
});

test("a log without the expected columns gives no runs", () => {
  assert.deepEqual(unseenRuns("when\tcount\n1\t2", ""), []);
  assert.deepEqual(unseenRuns("", ""), []);
});

test("the newest added roles come from the end of the history", () => {
  const history = [
    "https://a\t2026-11-17\tp\tOld Role\tOldCo\tadded\tx",
    "https://b\t2026-11-17\tp\tSkipped\tCoB\tskipped_title\tx",
    "https://c\t2026-11-17\tp\tBackend Engineer\tAcme\tadded\tx",
    "https://d\t2026-11-17\tp\tAPI Developer\tBeta\tadded\tx",
  ].join("\n");
  assert.deepEqual(newestAdded(history, 2), [
    { role: "API Developer", company: "Beta" },
    { role: "Backend Engineer", company: "Acme" },
  ]);
});

test("no new roles means no message; the text names two roles and counts the rest", () => {
  assert.equal(buildMessage(0, []), null);
  const one = buildMessage(1, [{ role: "Backend Engineer", company: "Acme" }]);
  assert.equal(one.subtitle, "1 new role");
  assert.equal(one.message, "Backend Engineer at Acme");
  const many = buildMessage(5, [{ role: "A", company: "X" }, { role: "B", company: "Y" }, { role: "C", company: "Z" }]);
  assert.equal(many.subtitle, "5 new roles");
  assert.equal(many.message, "A at X · B at Y · and 3 more");
});

test("untrusted titles lose quotes, backticks, control characters and excess length", () => {
  const dirty = 'Dev "; do shell script `rm -rf ~`\n‮evil\u0000 ' + "x".repeat(200);
  const clean = cleanText(dirty, 40);
  assert.ok(!/["'`\\\n\u0000‮]/.test(clean));
  assert.ok(clean.length <= 40);
});
