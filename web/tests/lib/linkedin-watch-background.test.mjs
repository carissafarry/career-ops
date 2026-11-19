import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

// Runs the real background.js against a fake Chrome and a fake LinkedIn that pages its results with start=25, 50, ...
const src = fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../extensions/linkedin-watch/background.js"), "utf8");
const SEARCH = "https://www.linkedin.com/jobs/search-results/?currentJobId=111&keywords=Backend&f_TPR=r86400";
const card = (id) => ({ jobId: String(id), title: `Job ${id}`, company: "Co", location: "Jakarta", posted: "" });
const range = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => card(from + i));

// pages by start offset: 25 + 25 + 10 jobs; only the last page has no enabled Next button
const RESULTS = { 0: { cards: range(1, 25), hasNext: true }, 25: { cards: range(26, 50), hasNext: true }, 50: { cards: range(51, 60), hasNext: false } };

function harness({ results = RESULTS, onUpdate } = {}) {
  const visited = [];
  let tabUrl = SEARCH;
  const listeners = new Set();
  const ctx = vm.createContext({
    URL, console, Promise, Set, Math: Object.assign(Object.create(Math), { random: () => 0 }),
    // the short pauses (sleep) run at once; the long safety timeouts (page load, reply) never fire
    setTimeout: (fn, ms) => { if (ms < 10_000) queueMicrotask(fn); return 0; }, clearTimeout: () => {}, AbortSignal,
    chrome: {
      alarms: { create() {}, clear() {}, get: async () => null, onAlarm: { addListener() {} } },
      runtime: { onInstalled: { addListener() {} }, onStartup: { addListener() {} } },
      storage: { local: { get: async () => ({}), set: async () => {} } },
      windows: { create: async () => ({ tabs: [{ id: 1 }] }) },
      tabs: {
        get: async () => ({ id: 1, url: tabUrl, title: "LinkedIn" }),
        // the page load finishes a moment after update(), as in Chrome
        update: async (_id, { url }) => { visited.push(url); tabUrl = onUpdate ? onUpdate(url) : url; setTimeout(() => listeners.forEach((l) => l(1, { status: "complete" })), 5); },
        onUpdated: { addListener: (l) => listeners.add(l), removeListener: (l) => listeners.delete(l) },
        sendMessage: async () => {
          const u = new URL(tabUrl);
          if (!/\/jobs\/search/.test(u.pathname)) return { cards: [], hasNext: false, pager: [], version: "0.5.0", page: { url: tabUrl, title: "Sign in", bodyText: "", status: 200 } };
          const page = results[Number(u.searchParams.get("start") ?? 0)] ?? { cards: [], hasNext: false };
          return { ...page, pager: [], version: "0.5.0", diag: {}, page: { url: tabUrl, title: "Jobs", bodyText: "", status: 200 } };
        },
      },
    },
  });
  vm.runInContext(src, ctx);
  return { read: (pages) => vm.runInContext("readAllPages", ctx)(1, SEARCH, pages), visited };
}

test("pages are loaded by start= and reading stops at the last page, without asking for one more", async () => {
  const h = harness();
  const out = await h.read(5);
  assert.equal(out.pages, 3);
  assert.equal(out.cards.length, 60);
  assert.equal(new Set(out.cards.map((c) => c.jobId)).size, 60);
  assert.equal(out.stop, "last-page");
  assert.deepEqual(h.visited.map((u) => new URL(u).searchParams.get("start")), ["25", "50"]);
  for (const u of h.visited) {
    assert.equal(new URL(u).searchParams.get("keywords"), "Backend"); // the search itself is kept
    assert.equal(new URL(u).searchParams.get("f_TPR"), "r86400");
    assert.equal(new URL(u).searchParams.has("currentJobId"), false); // a stale selected job is not carried over
  }
});

test("it never reads more pages than asked for", async () => {
  const two = await harness().read(2);
  assert.deepEqual([two.pages, two.cards.length, two.stop], [2, 50, "reached-limit"]);
  const h = harness();
  const one = await h.read(1);
  assert.deepEqual([one.pages, one.cards.length, one.stop, h.visited.length], [1, 25, "one-page-asked", 0]);
});

test("if LinkedIn ignores start= (the same page comes back), it stops instead of counting a page", async () => {
  const same = { ...RESULTS, 25: RESULTS[0] };
  const out = await harness({ results: same }).read(3);
  assert.deepEqual([out.pages, out.cards.length, out.stop], [1, 25, "no-new-cards"]);
});

test("a login wall met while turning pages stops reading and is what the app sees", async () => {
  const out = await harness({ onUpdate: () => "https://www.linkedin.com/authwall?trk=x" }).read(3);
  assert.equal(out.stop, "left-results");
  assert.match(out.page.url, /authwall/);
  assert.equal(out.pages, 1);
  assert.equal(out.cards.length, 25);
});

test("a first page with no readable jobs does not go on to load more pages", async () => {
  const h = harness({ results: { 0: { cards: [], hasNext: true } } });
  const out = await h.read(3);
  assert.deepEqual([out.stop, h.visited.length], ["no-cards", 0]);
});

test("a page with fewer than 25 jobs is the last one: no further page is loaded", async () => {
  const h = harness({ results: { 0: { cards: range(1, 25), hasNext: true }, 25: { cards: range(26, 33), hasNext: true } } }); // 33 results, Next still looks enabled
  const out = await h.read(3);
  assert.deepEqual([out.pages, out.cards.length, out.stop], [2, 33, "last-page"]);
  assert.deepEqual(h.visited.map((u) => new URL(u).searchParams.get("start")), ["25"]); // start=50 is never requested
});
