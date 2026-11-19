import test from "node:test";
import assert from "node:assert/strict";
import { buildOsascriptArgs, notifyMac } from "../../src/lib/linkedin-watch/notify.mjs";

test("posting text is passed as argv, never inside the script", () => {
  const title = 'He said "hi" \\ x';
  const body = "line1\nline2";
  const args = buildOsascriptArgs(title, body);
  assert.equal(args[0], "-e");
  assert.ok(args[1].includes("on run argv"));
  assert.ok(!args[1].includes("hi"));
  assert.equal(args.at(-2), title);
  assert.equal(args.at(-1), body);
});

test("notifyMac swallows a failing osascript", async () => {
  const run = (_cmd, _args, cb) => cb(new Error("boom"));
  const origError = console.error;
  console.error = () => {};
  try {
    await notifyMac({ title: "t", body: "b" }, run);
  } finally {
    console.error = origError;
  }
});
