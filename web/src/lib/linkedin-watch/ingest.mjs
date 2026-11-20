// One poll result from the Chrome extension -> new state, status and the reply that
// tells the extension whether and when to poll again. All decisions live here.
import { detectHalt, normalizeRawCards } from "./page-read.mjs";
import { applyPoll, prune } from "./state.mjs";
import { postedAtMs } from "./posted-age.mjs";
import { nextDelayMs, pollsAllowed, withinActiveHours } from "./config.mjs";

const IDLE_DELAY_MS = 15 * 60_000;
const MAX_FAILURES = 2;

const HALT_TEXT = {
  "login-wall": "LinkedIn asked you to log in again",
  captcha: "LinkedIn showed a security check",
  checkpoint: "LinkedIn opened a checkpoint",
  "rate-limited": "LinkedIn answered 429 (too many requests)",
  "no-results": "No job cards could be read twice in a row",
};

// What the page script says happened while turning pages; short strings only, whatever the extension sends.
function cleanDiag(d) {
  if (!d || typeof d !== "object") return null;
  const str = (v, n) => (typeof v === "string" ? v.slice(0, n) : null);
  return {
    visibility: str(d.visibility, 12),
    focused: typeof d.focused === "boolean" ? d.focused : null,
    urlAfter: str(d.urlAfter, 200),
    cardsNow: Number.isInteger(d.cardsNow) ? d.cardsNow : null,
  };
}

// The page that added nothing new when reading stopped: where it landed and how many jobs it showed.
function cleanStopDiag(d) {
  const clean = cleanDiag(d);
  if (!clean) return null;
  return { ...clean, page: Number.isInteger(d.page) && d.page > 0 ? d.page : null };
}

export function handleIngest({ payload, cfg, state, status, now, random, notify, keep = null }) {
  const nowIso = now.toISOString();
  const manual = Boolean(status.runNowRequestedAt);
  let next = { ...status, lastHeartbeatAt: nowIso, runNowRequestedAt: null };
  const reply = (enabled, delay) => ({ enabled, nextDelayMs: delay, searchUrl: cfg.searchUrl });
  const halt = (reason) => {
    next = { ...next, state: "halted", haltReason: reason, nextPollAt: null };
    notify({ title: "LinkedIn watcher stopped", body: `${HALT_TEXT[reason]}. Open the LinkedIn menu to resume.` });
    return { state, status: next, reply: reply(false, 0) };
  };

  if (status.state !== "running") return { state, status: next, reply: reply(false, 0) };

  const haltReason = detectHalt(payload.page);
  if (haltReason) return halt(haltReason);

  // A manual "Run now" ignores active hours and the daily cap; the safety halts above still apply.
  if (!manual && (!withinActiveHours(cfg, now) || !pollsAllowed(cfg, status.pollTimes, now))) {
    next = { ...next, nextPollAt: new Date(now.getTime() + IDLE_DELAY_MS).toISOString() };
    return { state, status: next, reply: reply(true, IDLE_DELAY_MS) };
  }

  const cards = normalizeRawCards(payload.cards);
  // "Ignore jobs older than N hours": counted on the age LinkedIn shows. A card with no readable age is kept.
  if (cfg.maxAgeHours) {
    const limitMs = cfg.maxAgeHours * 3_600_000;
    const tooOld = (card) => {
      const at = postedAtMs(card.postedText, nowIso);
      return at !== null && now.getTime() - at > limitMs;
    };
    const userKeep = keep;
    keep = (card) => !tooOld(card) && (userKeep ? userKeep(card) : true);
  }
  // How many pages the app asked for on this poll: deep for the first scan and Run now, few otherwise.
  const pagesRequested = manual || !state.baselineAt ? cfg.deepPages : cfg.pagesPerPoll;
  const result = applyPoll(state, cards, nowIso, keep ?? undefined);
  const delay = nextDelayMs(cfg, random);
  const today = now.toDateString();
  const newToday = status.newTodayDate === today ? status.newToday : 0;
  const twoDaysAgo = now.getTime() - 2 * 86_400_000;
  next = {
    ...next,
    lastPollAt: nowIso,
    lastCardCount: cards.length,
    // Which jobs this poll actually read: a listed posting missing from it is no longer in the results.
    lastReadIds: cards.map((c) => c.id).slice(0, 300),
    lastPages: Number.isInteger(payload.pages) && payload.pages > 0 ? payload.pages : 1,
    lastRead: {
      requested: pagesRequested,
      // absent when the extension is an old version, or its page script never answered
      version: typeof payload.version === "string" ? payload.version.slice(0, 20) : null,
      stop: typeof payload.stop === "string" ? payload.stop.slice(0, 40) : null,
      pager: Array.isArray(payload.pager) ? payload.pager.slice(0, 12).map((t) => String(t).slice(0, 30)) : [],
      diag: cleanDiag(payload.diag),
      stopDiag: cleanStopDiag(payload.stopDiag),
    },
    lastKeptCount: keep ? cards.filter(keep).length : cards.length,
    lastNewCount: result.baselineSaved ? 0 : result.newPostings.length,
    lastBaseline: result.baselineSaved,
    nextPollAt: new Date(now.getTime() + delay).toISOString(),
    pollTimes: [...status.pollTimes, nowIso].filter((t) => Date.parse(t) >= twoDaysAgo),
    newTodayDate: today,
    newToday,
  };

  if (result.failed) {
    next.consecutiveFailures = status.consecutiveFailures + 1;
    if (next.consecutiveFailures >= MAX_FAILURES) return halt("no-results");
    return { state, status: next, reply: reply(true, delay) };
  }

  next.consecutiveFailures = 0;
  next.newToday = newToday + result.newPostings.length;
  if (result.newPostings.length > 0) {
    const first = result.newPostings[0];
    const count = result.newPostings.length;
    notify({
      title: count === 1 ? "New LinkedIn job" : `${count} new LinkedIn jobs`,
      body: `${first.title} - ${first.company}${count > 1 ? ` (+${count - 1} more)` : ""}`,
    });
  }
  // Mark what this poll notified about, so the menu can tell notified postings from the baseline list.
  const notifiedIds = new Set(result.newPostings.map((p) => p.id));
  const marked = { ...result.state, postings: result.state.postings.map((p) => (notifiedIds.has(p.id) ? { ...p, notified: true } : p)) };
  return { state: prune(marked, nowIso), status: next, reply: reply(true, delay) };
}
