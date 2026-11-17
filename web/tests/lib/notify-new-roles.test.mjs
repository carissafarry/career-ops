import assert from "node:assert/strict";
import { test } from "node:test";
import { addedSince, buildMessage, cleanText } from "../../../scripts/notify-new-roles.mjs";

const row = (role, company, status = "added") => `https://x/${role}\t2026-11-17\tp\t${role}\t${company}\t${status}\tJakarta\n`;
const buf = (...lines) => Buffer.from(lines.join(""), "utf8");

test("only roles after the offset count, newest first, and skipped rows are ignored", () => {
  const first = buf(row("Old Role", "OldCo"));
  const all = Buffer.concat([first, buf(row("Backend Engineer", "Acme"), row("Skipped", "Zed", "skipped_title"), row("API Developer", "Beta"))]);
  const { roles, next, reset } = addedSince(all, first.length);
  assert.equal(reset, false);
  assert.deepEqual(roles, [
    { role: "API Developer", company: "Beta" },
    { role: "Backend Engineer", company: "Acme" },
  ]);
  assert.equal(next, all.length);
  assert.deepEqual(addedSince(all, next).roles, []);
});

test("a half-written last line waits for the next look", () => {
  const whole = buf(row("A", "X"));
  const partial = Buffer.concat([whole, Buffer.from("https://x/B\t2026-11-17\tp\tB\tY\tadd", "utf8")]);
  const { roles, next } = addedSince(partial, 0);
  assert.deepEqual(roles, [{ role: "A", company: "X" }]);
  assert.equal(next, whole.length);
});

test("an offset past the end means the file was rewritten: restart from the end, announce nothing", () => {
  const all = buf(row("A", "X"));
  const result = addedSince(all, all.length + 500);
  assert.equal(result.reset, true);
  assert.equal(result.next, all.length);
  assert.deepEqual(result.roles, []);
});

test("accented text is cut on bytes, not characters", () => {
  const first = buf(row("Café Dev", "Zürich AG"));
  const all = Buffer.concat([first, buf(row("Développeur", "Société"))]);
  assert.deepEqual(addedSince(all, first.length).roles, [{ role: "Développeur", company: "Société" }]);
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
