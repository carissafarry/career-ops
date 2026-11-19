// Dumb on purpose: an alarm fires, one tab is reloaded and read, the app decides the rest.
// The app's reply says whether to continue and how long to wait (random delay computed server-side).
const APP = "http://localhost:3000";
const POLL = "poll";
const BOOT = "boot";
const RETRY_MS = 2 * 60_000;
const MIN_DELAY_MS = 30_000;
const WINDOW_STATE = "minimized"; // switch to "normal" if LinkedIn does not render a minimized tab

async function schedule(ms) {
  await chrome.alarms.clear(POLL);
  await chrome.alarms.create(POLL, { when: Date.now() + Math.max(ms, MIN_DELAY_MS) });
}

async function appConfig() {
  const res = await fetch(`${APP}/api/linkedin-watch/config`, { signal: AbortSignal.timeout(10_000) });
  return res.json();
}

function waitComplete(tabId, timeoutMs = 30_000) {
  return new Promise((resolve) => {
    const done = () => {
      chrome.tabs.onUpdated.removeListener(onUpdated);
      clearTimeout(timer);
      resolve();
    };
    const onUpdated = (id, info) => { if (id === tabId && info.status === "complete") done(); };
    const timer = setTimeout(done, timeoutMs);
    chrome.tabs.onUpdated.addListener(onUpdated);
  });
}

async function pollTab(searchUrl) {
  const { tabId } = await chrome.storage.local.get("tabId");
  const existing = tabId ? await chrome.tabs.get(tabId).catch(() => null) : null;
  if (existing) {
    await chrome.tabs.update(existing.id, { url: searchUrl });
    await waitComplete(existing.id);
    return existing.id;
  }
  const win = await chrome.windows.create({ url: searchUrl, state: WINDOW_STATE, focused: false });
  const id = win.tabs[0].id;
  await chrome.storage.local.set({ tabId: id });
  await waitComplete(id);
  return id;
}

async function readTab(tabId, pages = 1) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const reply = await Promise.race([
        chrome.tabs.sendMessage(tabId, { type: "linkedin-watch-read", pages }),
        new Promise((resolve) => setTimeout(resolve, 20_000 + pages * 15_000)),
      ]);
      if (reply) return reply;
    } catch {
      // content script not injected (e.g. redirected to a login page); retry, then fall back
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  const tab = await chrome.tabs.get(tabId);
  return { cards: [], page: { url: tab.url || "", title: tab.title || "", bodyText: "", status: 200 } };
}

const PAGE_SIZE = 25;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const onResults = (url) => { try { return /\/jobs\/search/.test(new URL(url).pathname); } catch { return false; } };
// LinkedIn pages its results with start=25, start=50, ... in the URL; currentJobId only selects a job to show.
const pageUrl = (searchUrl, pageIndex) => {
  const u = new URL(searchUrl);
  u.searchParams.set("start", String(pageIndex * PAGE_SIZE));
  u.searchParams.delete("currentJobId");
  return u.toString();
};

// Reads up to `pages` pages: page 1 is already loaded; each further page is loaded by its URL, after a random
// pause, until the pager says there is no next page, nothing new shows up, or LinkedIn leaves the results.
async function readAllPages(tabId, searchUrl, pages) {
  const first = await readTab(tabId);
  const result = { ...first, cards: [...first.cards], pages: 1 };
  const seen = new Set(first.cards.map((c) => c.jobId));
  let last = first;
  let stop = pages <= 1 ? "one-page-asked" : "reached-limit";
  for (let index = 1; index < pages; index += 1) {
    if (last.cards.length === 0) { stop = "no-cards"; break; }
    if (last.hasNext !== true) { stop = "last-page"; break; }
    await sleep(2_000 + Math.random() * 2_000);
    await chrome.tabs.update(tabId, { url: pageUrl(searchUrl, index) });
    await waitComplete(tabId);
    const next = await readTab(tabId);
    result.page = next.page; // the last page seen is what the app checks for a login wall or checkpoint
    if (!onResults(next.page.url)) { stop = "left-results"; break; }
    const fresh = next.cards.filter((c) => !seen.has(c.jobId));
    if (fresh.length === 0) { stop = "no-new-cards"; break; }
    for (const c of fresh) seen.add(c.jobId);
    result.cards.push(...fresh);
    result.pages = index + 1;
    result.hasNext = next.hasNext;
    result.pager = next.pager;
    result.diag = next.diag;
    last = next;
    // A page holding fewer than 25 jobs is the last one. Loading one more would only get the same page back.
    if (next.cards.length < PAGE_SIZE) { stop = "last-page"; break; }
  }
  result.stop = stop;
  return result;
}

let polling = false;

async function poll() {
  if (polling) return;
  polling = true;
  try {
    const cfg = await appConfig();
    if (!cfg.enabled || !cfg.searchUrl) return;
    const payload = await readAllPages(await pollTab(cfg.searchUrl), cfg.searchUrl, Number.isInteger(cfg.pages) ? cfg.pages : 1);
    const res = await fetch(`${APP}/api/linkedin-watch/ingest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(20_000),
    });
    const reply = await res.json();
    if (reply.enabled) await schedule(reply.nextDelayMs);
  } catch {
    await schedule(RETRY_MS); // app not running or network hiccup: one retry alarm, nothing queued
  } finally {
    polling = false;
  }
}

// Every 30 s: pick up a manual "Run now" from the app, and start polling if enabled with no alarm pending.
async function boot() {
  try {
    const cfg = await appConfig();
    if (cfg.enabled && cfg.runNow) {
      await poll();
    } else if (cfg.enabled && !(await chrome.alarms.get(POLL))) {
      await schedule(MIN_DELAY_MS);
    }
  } catch {
    // app not running; the next boot tick tries again
  }
}

function ensureBootAlarm() {
  chrome.alarms.create(BOOT, { delayInMinutes: 0.1, periodInMinutes: 0.5 });
}

chrome.runtime.onInstalled.addListener(ensureBootAlarm);
chrome.runtime.onStartup.addListener(ensureBootAlarm);
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === POLL) poll();
  else if (alarm.name === BOOT) boot();
});
