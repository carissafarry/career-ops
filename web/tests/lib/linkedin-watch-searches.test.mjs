// Saved LinkedIn searches: save the current URL, try another, come back to the first with its list intact.
//
// Run: node --experimental-strip-types --test tests/lib/linkedin-watch-searches.test.mjs

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { applyAction, getOverview } from "../../src/lib/linkedin-watch/api.mjs";
import { watchPaths, readState, writeState, readStash } from "../../src/lib/linkedin-watch/store.mjs";
import { emptyState } from "../../src/lib/linkedin-watch/state.mjs";
import { searchKey } from "../../src/lib/linkedin-watch/searches.mjs";
import { mergeStates } from "../../src/lib/linkedin-watch/state.mjs";

const A = "https://www.linkedin.com/jobs/search-results/?keywords=Backend&f_TPR=r86400&sortBy=DD";
const B = "https://www.linkedin.com/jobs/search-results/?keywords=AI%20Engineer&f_TPR=r86400&sortBy=DD";
const paths = () => watchPaths(fs.mkdtempSync(path.join(os.tmpdir(), "lw-searches-")));
const posting = (id) => ({ id, title: `T${id}`, company: "C", location: "Remote", link: `https://www.linkedin.com/jobs/view/${id}/`, firstSeen: "2026-11-20T01:00:00.000Z" });
const withList = (p, ids) => writeState(p, { baselineAt: "2026-11-20T01:00:00.000Z", seen: Object.fromEntries(ids.map((i) => [i, "x"])), postings: ids.map(posting) });

test("the same search is one key even when LinkedIn adds a job id or a page", () => {
  assert.equal(searchKey(A), searchKey(`${A}&currentJobId=4001&referralSearchId=abc&start=25`));
  assert.notEqual(searchKey(A), searchKey(B));
});

test("save-search keeps the current URL under a name; the same URL is renamed, not doubled", () => {
  const p = paths();
  applyAction(p, { action: "save-config", search_url: A });
  assert.equal(applyAction(p, { action: "save-search", name: "Backend" }).status, 200);
  assert.equal(applyAction(p, { action: "save-search", name: "Backend ID" }).status, 200);
  const list = getOverview(p).searches;
  assert.equal(list.length, 1);
  assert.equal(list[0].name, "Backend ID");
  assert.equal(list[0].active, true);
});

test("save-search needs a name and a saved URL", () => {
  const p = paths();
  assert.equal(applyAction(p, { action: "save-search", name: "x" }).status, 400);
  applyAction(p, { action: "save-config", search_url: A });
  assert.equal(applyAction(p, { action: "save-search", name: "  " }).status, 400);
});

test("using another saved search swaps the active URL and its list, and coming back restores the first list", () => {
  const p = paths();
  applyAction(p, { action: "save-config", search_url: A, interval_minutes: 12 });
  applyAction(p, { action: "save-search", name: "Backend" });
  withList(p, ["1", "2", "3"]);

  applyAction(p, { action: "save-config", search_url: B, interval_minutes: 12 });
  applyAction(p, { action: "save-search", name: "AI" });
  assert.equal(readState(p).postings.length, 0, "a new search starts with its own empty list");
  assert.equal(readState(p).baselineAt, null, "and takes its own baseline, so nothing floods in as new");
  withList(p, ["9"]);

  const idA = getOverview(p).searches.find((s) => s.name === "Backend").id;
  assert.equal(applyAction(p, { action: "use-search", id: idA }).status, 200);
  assert.equal(getOverview(p).config.search_url, A);
  assert.equal(getOverview(p).config.interval_minutes, 12, "other settings stay");
  assert.deepEqual(readState(p).postings.map((x) => x.id), ["1", "2", "3"]);

  const idB = getOverview(p).searches.find((s) => s.name === "AI").id;
  applyAction(p, { action: "use-search", id: idB });
  assert.deepEqual(readState(p).postings.map((x) => x.id), ["9"], "the second list was kept too");
});

test("pasting a URL you never saved still keeps the old list, and pasting the old URL again brings it back", () => {
  const p = paths();
  applyAction(p, { action: "save-config", search_url: A });
  withList(p, ["1", "2"]);
  applyAction(p, { action: "save-config", search_url: B });
  assert.equal(readState(p).postings.length, 0);
  applyAction(p, { action: "save-config", search_url: A });
  assert.deepEqual(readState(p).postings.map((x) => x.id), ["1", "2"]);
});

test("saving other settings on the same URL leaves the list alone", () => {
  const p = paths();
  applyAction(p, { action: "save-config", search_url: A });
  withList(p, ["1"]);
  applyAction(p, { action: "save-config", search_url: `${A}&currentJobId=77`, interval_minutes: 20 });
  assert.deepEqual(readState(p).postings.map((x) => x.id), ["1"]);
});

test("save-config keeps the saved searches (it rewrites the config file)", () => {
  const p = paths();
  applyAction(p, { action: "save-config", search_url: A });
  applyAction(p, { action: "save-search", name: "Backend" });
  applyAction(p, { action: "save-config", search_url: A, interval_minutes: 15 });
  assert.equal(getOverview(p).searches.length, 1);
});

test("the overview says how many postings each saved search holds", () => {
  const p = paths();
  applyAction(p, { action: "save-config", search_url: A });
  applyAction(p, { action: "save-search", name: "Backend" });
  withList(p, ["1", "2", "3"]);
  applyAction(p, { action: "save-config", search_url: B });
  applyAction(p, { action: "save-search", name: "AI" });
  const byName = Object.fromEntries(getOverview(p).searches.map((s) => [s.name, s]));
  assert.equal(byName.Backend.count, 3);
  assert.equal(byName.AI.count, 0);
  assert.equal(byName.AI.active, true);
  assert.equal(byName.Backend.active, false);
});

test("delete-search removes only the list entry; its postings are still there if the URL comes back", () => {
  const p = paths();
  applyAction(p, { action: "save-config", search_url: A });
  applyAction(p, { action: "save-search", name: "Backend" });
  withList(p, ["1", "2"]);
  applyAction(p, { action: "save-config", search_url: B });
  const id = getOverview(p).searches[0].id;
  assert.equal(applyAction(p, { action: "delete-search", id }).status, 200);
  assert.equal(getOverview(p).searches.length, 0);
  applyAction(p, { action: "save-config", search_url: A });
  assert.deepEqual(readState(p).postings.map((x) => x.id), ["1", "2"]);
});

test("use-search and delete-search refuse an unknown id; the list holds at most 20", () => {
  const p = paths();
  assert.equal(applyAction(p, { action: "use-search", id: "nope" }).status, 404);
  assert.equal(applyAction(p, { action: "delete-search", id: "nope" }).status, 404);
  for (let i = 0; i < 20; i += 1) {
    applyAction(p, { action: "save-config", search_url: `${A}&q=${i}` });
    assert.equal(applyAction(p, { action: "save-search", name: `S${i}` }).status, 200);
  }
  applyAction(p, { action: "save-config", search_url: `${A}&q=extra` });
  assert.equal(applyAction(p, { action: "save-search", name: "one too many" }).status, 400);
});

test("the stored list of a search the watcher has never seen is empty, not an error", () => {
  const p = paths();
  applyAction(p, { action: "save-config", search_url: A });
  assert.deepEqual(readState(p), emptyState());
});

test("the sort order is not part of the search: adding sortBy keeps the same list", () => {
  const plain = "https://www.linkedin.com/jobs/search-results/?keywords=Backend&f_TPR=r86400";
  assert.equal(searchKey(plain), searchKey(`${plain}&sortBy=DD`));
  assert.equal(searchKey(plain), searchKey(`${plain}&sortBy=R`));
  const p = paths();
  applyAction(p, { action: "save-config", search_url: plain });
  withList(p, ["1", "2"]);
  applyAction(p, { action: "save-config", search_url: `${plain}&sortBy=DD` });
  assert.deepEqual(readState(p).postings.map((x) => x.id), ["1", "2"]);
});

const st = (baselineAt, seen, postings) => ({ baselineAt, seen, postings });
const pt = (id, firstSeen, extra = {}) => ({ id, title: `T${id}`, company: "C", location: "Remote", link: `https://www.linkedin.com/jobs/view/${id}/`, firstSeen, ...extra });

test("mergeStates keeps every posting from both lists once, newest first", () => {
  const a = st("2026-11-19T11:00:00.000Z", { 1: "2026-11-19T11:00:00.000Z", 2: "2026-11-19T11:00:00.000Z" }, [pt("1", "2026-11-19T11:00:00.000Z"), pt("2", "2026-11-19T11:00:00.000Z")]);
  const b = st("2026-11-19T17:00:00.000Z", { 2: "2026-11-19T17:00:00.000Z", 3: "2026-11-19T17:00:00.000Z" }, [pt("2", "2026-11-19T17:00:00.000Z"), pt("3", "2026-11-19T17:00:00.000Z")]);
  const m = mergeStates(a, b);
  assert.deepEqual(m.postings.map((x) => x.id), ["3", "1", "2"]);
  assert.equal(m.baselineAt, "2026-11-19T11:00:00.000Z");
  assert.deepEqual(Object.keys(m.seen).sort(), ["1", "2", "3"]);
  assert.equal(m.seen["2"], "2026-11-19T11:00:00.000Z", "the earliest time a job was seen wins");
});

test("mergeStates keeps what she already did with a posting", () => {
  const a = st("x", { 1: "2026-11-19T11:00:00.000Z" }, [pt("1", "2026-11-19T11:00:00.000Z", { applied: true, addedToPipeline: true, acknowledged: true, scanId: "linkedin-1" })]);
  const b = st("x", { 1: "2026-11-19T17:00:00.000Z" }, [pt("1", "2026-11-19T17:00:00.000Z", { notified: true })]);
  for (const m of [mergeStates(a, b), mergeStates(b, a)]) {
    const only = m.postings[0];
    assert.equal(m.postings.length, 1);
    assert.equal(only.applied, true);
    assert.equal(only.addedToPipeline, true);
    assert.equal(only.acknowledged, true);
    assert.equal(only.notified, true);
    assert.equal(only.scanId, "linkedin-1");
    assert.equal(only.firstSeen, "2026-11-19T11:00:00.000Z");
  }
});

test("mergeStates with an empty list returns the other list unchanged", () => {
  const a = st("2026-11-19T11:00:00.000Z", { 1: "2026-11-19T11:00:00.000Z" }, [pt("1", "2026-11-19T11:00:00.000Z")]);
  assert.deepEqual(mergeStates(a, { baselineAt: null, seen: {}, postings: [] }), a);
  assert.deepEqual(mergeStates({ baselineAt: null, seen: {}, postings: [] }, a), a);
});

const savedId = (p, name) => getOverview(p).searches.find((x) => x.name === name).id;

test("editing the URL of the search in use keeps its name and its list", () => {
  const p = paths();
  applyAction(p, { action: "save-config", search_url: A, interval_minutes: 12 });
  applyAction(p, { action: "save-search", name: "Backend" });
  withList(p, ["1", "2"]);
  const newUrl = "https://www.linkedin.com/jobs/search-results/?keywords=Backend&f_TPR=r604800&sortBy=DD";
  assert.equal(applyAction(p, { action: "update-search", id: savedId(p, "Backend"), url: newUrl }).status, 200);
  const o = getOverview(p);
  assert.equal(o.config.search_url, newUrl);
  assert.equal(o.config.interval_minutes, 12);
  assert.equal(o.searches.length, 1);
  assert.equal(o.searches[0].name, "Backend");
  assert.equal(o.searches[0].active, true);
  assert.equal(o.searches[0].count, 2);
  assert.deepEqual(readState(p).postings.map((x) => x.id), ["1", "2"]);
});

test("after editing the active search, switching away and back still finds its list", () => {
  const p = paths();
  applyAction(p, { action: "save-config", search_url: A });
  applyAction(p, { action: "save-search", name: "Backend" });
  withList(p, ["1", "2"]);
  applyAction(p, { action: "update-search", id: savedId(p, "Backend"), url: `${B}&x=1` });
  applyAction(p, { action: "save-config", search_url: `${A}&other=1` });
  applyAction(p, { action: "save-search", name: "Other" });
  applyAction(p, { action: "use-search", id: savedId(p, "Backend") });
  assert.deepEqual(readState(p).postings.map((x) => x.id), ["1", "2"]);
});

test("editing a search that is not in use moves its list to the new URL and leaves the old copy", () => {
  const p = paths();
  applyAction(p, { action: "save-config", search_url: A });
  applyAction(p, { action: "save-search", name: "Backend" });
  withList(p, ["1", "2", "3"]);
  const oldId = savedId(p, "Backend");
  applyAction(p, { action: "save-config", search_url: B });
  applyAction(p, { action: "save-search", name: "AI" });
  const newUrl = "https://www.linkedin.com/jobs/search-results/?keywords=Backend&f_TPR=r604800";
  assert.equal(applyAction(p, { action: "update-search", id: oldId, url: newUrl }).status, 200);
  assert.equal(getOverview(p).config.search_url, B, "the search in use is untouched");
  const edited = getOverview(p).searches.find((x) => x.name === "Backend");
  assert.equal(edited.count, 3);
  assert.equal(edited.url, newUrl);
  assert.ok(readStash(p, oldId), "the old copy is not deleted");
  applyAction(p, { action: "use-search", id: edited.id });
  assert.deepEqual(readState(p).postings.map((x) => x.id), ["1", "2", "3"]);
});

test("adding sortBy to a saved URL only updates the URL", () => {
  const p = paths();
  const plain = "https://www.linkedin.com/jobs/search-results/?keywords=Backend&f_TPR=r86400";
  applyAction(p, { action: "save-config", search_url: plain });
  applyAction(p, { action: "save-search", name: "Backend" });
  const id = savedId(p, "Backend");
  applyAction(p, { action: "update-search", id, url: `${plain}&sortBy=DD` });
  assert.equal(savedId(p, "Backend"), id);
  assert.equal(getOverview(p).config.search_url, `${plain}&sortBy=DD`);
});

test("editing to a URL that is already another saved search is refused and changes nothing", () => {
  const p = paths();
  applyAction(p, { action: "save-config", search_url: A });
  applyAction(p, { action: "save-search", name: "Backend" });
  applyAction(p, { action: "save-config", search_url: B });
  applyAction(p, { action: "save-search", name: "AI" });
  const r = applyAction(p, { action: "update-search", id: savedId(p, "AI"), url: A });
  assert.equal(r.status, 400);
  assert.match(r.body.error, /Backend/);
  assert.equal(getOverview(p).config.search_url, B);
});

test("editing needs a LinkedIn jobs search URL and a known search", () => {
  const p = paths();
  applyAction(p, { action: "save-config", search_url: A });
  applyAction(p, { action: "save-search", name: "Backend" });
  const id = savedId(p, "Backend");
  assert.equal(applyAction(p, { action: "update-search", id, url: "https://example.com/jobs/search/" }).status, 400);
  assert.equal(applyAction(p, { action: "update-search", id, url: "" }).status, 400);
  assert.equal(applyAction(p, { action: "update-search", id: "nope", url: B }).status, 404);
  assert.equal(getOverview(p).config.search_url, A);
});
