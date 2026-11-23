import test from "node:test";
import assert from "node:assert/strict";
import { viewedOutcomes } from "../../src/lib/viewed-outcomes.mjs";
import { computeProgressMetrics } from "../../src/lib/analytics-metrics.mjs";
import { progressModel } from "../../src/lib/analytics/view-model.mjs";

const app = (n, status) => ({ n: String(n), status });
const move = (num, from, to) => ({ num, from, to });

test("viewed outcomes: advanced, waiting and stopped are read from where each viewed row stands today", () => {
  const apps = [app(1, "Viewed"), app(2, "Responded"), app(3, "Interview"), app(4, "Rejected"), app(5, "Discarded"), app(6, "Applied"), app(7, "Hired")];
  const log = [move(2, "Applied", "Viewed"), move(2, "Viewed", "Responded"), move(3, "Viewed", "Interview"), move(4, "Viewed", "Rejected"), move(5, "Viewed", "Discarded"), move(7, "Viewed", "Hired")];
  const o = viewedOutcomes(apps, log);
  assert.deepEqual([o.total, o.advanced, o.waiting, o.stopped], [6, 3, 1, 2]);
  assert.deepEqual([o.byStage.RESPONDED, o.byStage.INTERVIEW, o.byStage.HIRED], [1, 1, 1]);
  assert.equal(o.advancedOfResolved, 60); // 3 of the 5 that got an answer
});

test("a row that never passed through Viewed is not counted, and a still-waiting row needs no log", () => {
  const o = viewedOutcomes([app(1, "Responded"), app(2, "Rejected"), app(3, "Viewed")], []);
  assert.deepEqual([o.total, o.advanced, o.waiting, o.stopped], [1, 0, 1, 0]);
});

test("with nobody answered yet the share is absent, not zero", () => {
  const o = viewedOutcomes([app(1, "Viewed"), app(2, "Viewed")], []);
  assert.equal(o.advancedOfResolved, null);
  assert.equal(viewedOutcomes([], []).total, 0);
});

test("log history for a deleted row, or a row moved back to Applied, is ignored", () => {
  const o = viewedOutcomes([app(1, "Applied")], [move(1, "Applied", "Viewed"), move(9, "Applied", "Viewed")]);
  assert.equal(o.total, 0);
});

test("progress funnel gets a Viewed stage between Applied and Responded, nested", () => {
  const m = computeProgressMetrics([app(1, "Applied"), app(2, "Viewed"), app(3, "Responded"), app(4, "Rejected")]);
  assert.deepEqual(m.funnel.map((s) => s.label), ["Tracked", "Applied", "Viewed", "Responded", "Interview", "Offer"]);
  assert.deepEqual(m.funnel.map((s) => s.count), [4, 4, 2, 2, 0, 0]);
});

test("the conversion funnel from stats.mjs shows Viewed in the same place", () => {
  const model = progressModel({ tracker: { total: 4, activeApps: 3, avgScore: 4, topScore: 4.5 }, funnel: { everApplied: 4, everViewed: 3, everResponded: 2, everInterview: 0, everOffer: 0, responseRate: 50, interviewRate: 0, offerRate: 0, smallSample: true } });
  assert.deepEqual(model.funnel.stages.map((s) => s.label), ["Applied", "Viewed", "Responded", "Interviewed", "Offers"]);
});

test("a Rejected row is not counted as Viewed in the funnel unless it was marked Viewed", () => {
  const m = computeProgressMetrics([app(1, "Viewed"), app(2, "Rejected"), app(3, "Applied")]);
  assert.equal(m.funnel[2].label, "Viewed");
  assert.equal(m.funnel[2].count, 1);
});
