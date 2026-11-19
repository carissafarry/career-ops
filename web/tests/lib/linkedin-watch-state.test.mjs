import test from "node:test";
import assert from "node:assert/strict";
import { emptyState, applyPoll, prune } from "../../src/lib/linkedin-watch/state.mjs";

const card = (id) => ({ id, title: `T${id}`, company: "Co", location: "Remote", link: `https://www.linkedin.com/jobs/view/${id}/`, postedText: "5 minutes ago" });
const NOW = "2026-11-19T10:00:00.000Z";

test("first poll saves a baseline, lists everything as new, but reports nothing to notify", () => {
  const r = applyPoll(emptyState(), [card("1"), card("2"), card("3")], NOW);
  assert.equal(r.baselineSaved, true);
  assert.deepEqual(r.newPostings, []);
  assert.equal(Object.keys(r.state.seen).length, 3);
  assert.equal(r.state.baselineAt, NOW);
  assert.deepEqual(r.state.postings.map((p) => p.id), ["1", "2", "3"]);
  assert.ok(r.state.postings.every((p) => p.baseline === true && p.firstSeen === NOW));
});

test("later poll reports only unseen ids, newest first", () => {
  const base = applyPoll(emptyState(), [card("1"), card("2"), card("3")], NOW).state;
  const r = applyPoll(base, [card("4"), card("1"), card("2"), card("3")], "2026-11-19T10:10:00.000Z");
  assert.equal(r.newPostings.length, 1);
  assert.equal(r.newPostings[0].id, "4");
  assert.equal(r.newPostings[0].firstSeen, "2026-11-19T10:10:00.000Z");
  assert.equal(r.state.postings[0].id, "4");
  assert.equal(r.failed, false);
});

test("zero cards is a failure and leaves state untouched", () => {
  const base = applyPoll(emptyState(), [card("1")], NOW).state;
  const r = applyPoll(base, [], NOW);
  assert.equal(r.failed, true);
  assert.deepEqual(r.state, base);
  assert.deepEqual(r.newPostings, []);
  const empty = applyPoll(emptyState(), [], NOW);
  assert.equal(empty.failed, true);
  assert.equal(empty.state.baselineAt, null);
});

test("cards without id or link are dropped", () => {
  const base = applyPoll(emptyState(), [card("1")], NOW).state;
  const r = applyPoll(base, [{ ...card("2"), id: "" }, { ...card("3"), link: "" }, card("4")], NOW);
  assert.deepEqual(r.newPostings.map((p) => p.id), ["4"]);
  assert.equal(applyPoll(base, [{ ...card("2"), id: "" }], NOW).failed, true);
});

test("prune drops entries older than 30 days", () => {
  const old = "2026-09-01T00:00:00.000Z";
  const state = { baselineAt: old, seen: { a: old, b: NOW }, postings: [{ ...card("a"), firstSeen: old }, { ...card("b"), firstSeen: NOW }] };
  const p = prune(state, NOW);
  assert.deepEqual(Object.keys(p.seen), ["b"]);
  assert.deepEqual(p.postings.map((x) => x.id), ["b"]);
});

test("keep: filtered cards count as seen but are not listed or reported", () => {
  const keep = (c) => c.title !== "T2";
  const base = applyPoll(emptyState(), [card("1"), card("2")], NOW, keep);
  assert.deepEqual(base.state.postings.map((p) => p.id), ["1"]);
  assert.equal(Object.keys(base.state.seen).length, 2);
  const next = applyPoll(base.state, [card("3"), card("2"), card("1")], NOW, keep);
  assert.deepEqual(next.newPostings.map((p) => p.id), ["3"]);
  const again = applyPoll(next.state, [card("3"), card("2")], NOW, () => false);
  assert.equal(again.failed, false); // everything filtered out is not a failed poll
});
