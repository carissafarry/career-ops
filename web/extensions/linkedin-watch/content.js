// Passive until the background script asks for a read. Reads ONLY the visible result-list
// cards of the saved search tab: no clicks, no scrolling, no other pages.
const SELECTORS = {
  card: "li[data-occludable-job-id], [data-job-id].job-card-container, div[data-job-id]",
  title: ".job-card-list__title, .job-card-list__title--link, a[href*='/jobs/view/'] strong, a[href*='/jobs/view/']",
  company: ".artdeco-entity-lockup__subtitle, .job-card-container__primary-description",
  location: ".artdeco-entity-lockup__caption, .job-card-container__metadata-item",
  posted: "time",
};
const WAIT_MS = 10_000;

function text(root, selector) {
  const el = root.querySelector(selector);
  return el ? el.textContent.replace(/\s+/g, " ").trim() : "";
}

function jobIdOf(card) {
  const direct = card.getAttribute("data-occludable-job-id") || card.getAttribute("data-job-id");
  if (direct) return direct;
  const m = /\/jobs\/view\/(\d+)/.exec(card.querySelector("a[href*='/jobs/view/']")?.getAttribute("href") || "");
  return m ? m[1] : "";
}

const VIEW_LINK = "a[href*='/jobs/view/']";
const POSTED_RE = /(second|minute|hour|day|week|detik|menit|jam|hari|minggu).*(ago|lalu)|^(just now|baru saja)/i;

// Fallback that does not depend on class names: every job card links to /jobs/view/<id>.
// The id comes from the link; title, company and location are best-effort from the card's text lines.
function readFromLinks() {
  const out = new Map();
  for (const a of document.querySelectorAll(VIEW_LINK)) {
    const m = /\/jobs\/view\/(\d+)/.exec(a.getAttribute("href") || "");
    if (!m || out.has(m[1])) continue;
    let card = a;
    for (let i = 0; i < 6 && card.parentElement; i += 1) {
      if (card.matches("li") || card.hasAttribute("data-job-id") || card.innerText.split("\n").filter((l) => l.trim()).length >= 3) break;
      card = card.parentElement;
    }
    const lines = card.innerText.split("\n").map((l) => l.trim()).filter(Boolean).filter((l, i, all) => l !== all[i - 1]);
    const posted = lines.find((l) => POSTED_RE.test(l)) || "";
    const rest = lines.filter((l) => l !== posted);
    out.set(m[1], {
      jobId: m[1],
      title: (a.getAttribute("aria-label") || rest[0] || "").trim(),
      company: rest[1] || "",
      location: rest[2] || "",
      posted,
    });
  }
  return [...out.values()];
}

// Current LinkedIn layout (class names are hashed and unstable, attributes are not):
// <div role="button" componentkey="job-card-component-ref-<id>"> with <p> lines
// title (first span holds "<title> (Verified job)"), company, location, then extras.
const COMPONENT_KEY = "[componentkey^='job-card-component-ref-']";

// LinkedIn renders "Posted 4 minutes ago" plus a hidden duplicate: "Posted 4 minutes ago4 minutes ago".
function undouble(s) {
  const t = s.replace(/^Posted\s+/i, "");
  const half = t.length / 2;
  return Number.isInteger(half) && t.slice(0, half) === t.slice(half) ? t.slice(0, half) : t;
}

function readFromComponentKeys() {
  const out = new Map();
  for (const card of document.querySelectorAll(COMPONENT_KEY)) {
    const m = /job-card-component-ref-(\d+)/.exec(card.getAttribute("componentkey") || "");
    if (!m || out.has(m[1])) continue;
    const ps = [...card.querySelectorAll("p")].map((p) => p.textContent.replace(/\s+/g, " ").trim());
    // The visible title sits in the aria-hidden span; the first span is empty or "<title> (Verified job)".
    const spans = [...(card.querySelector("p")?.querySelectorAll("span") ?? [])].map((s) => s.textContent.replace(/\s+/g, " ").trim());
    const visible = card.querySelector("p span[aria-hidden='true']")?.textContent.replace(/\s+/g, " ").trim();
    const title = (visible || spans.find(Boolean) || ps[0] || "").replace(/\s*\((Verified job|Promoted)\)\s*$/i, "").trim();
    out.set(m[1], {
      jobId: m[1],
      title,
      company: ps[1] || "",
      location: ps[2] || "",
      posted: undouble(ps.find((l) => POSTED_RE.test(l)) || ""),
    });
  }
  return [...out.values()];
}

function readCards() {
  const byKey = readFromComponentKeys();
  if (byKey.length > 0) return byKey;
  const byClass =[...document.querySelectorAll(SELECTORS.card)].map((card) => ({
    jobId: jobIdOf(card),
    title: text(card, SELECTORS.title),
    company: text(card, SELECTORS.company),
    location: text(card, SELECTORS.location),
    posted: text(card, SELECTORS.posted),
  })).filter((c) => c.jobId);
  return byClass.length > 0 ? byClass : readFromLinks();
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// The pager's "Next" button, matched on its exact label so no control that merely mentions "next" is used.
// Only reported, never clicked: the background script turns pages by loading each page's URL (start=25, 50, ...),
// because LinkedIn ignored scripted clicks on this button.
function findNextButton() {
  return [...document.querySelectorAll("button")].find((b) => {
    const label = (b.getAttribute("aria-label") || b.textContent || "").trim().toLowerCase();
    return label === "next" && !b.disabled && b.getAttribute("aria-disabled") !== "true";
  }) ?? null;
}

// What the pager looks like, reported back so a missing "Next" can be diagnosed from the app.
const pagerLabels = () =>
  [...document.querySelectorAll("button")]
    .map((b) => (b.getAttribute("aria-label") || b.textContent || "").trim().replace(/\s+/g, " "))
    .filter((t) => /^(page \d+|next|previous|\d{1,3})$/i.test(t))
    .slice(0, 12);

async function readWhenReady() {
  const deadline = Date.now() + WAIT_MS;
  while (Date.now() < deadline && document.querySelectorAll(COMPONENT_KEY).length === 0 && document.querySelectorAll(SELECTORS.card).length === 0 && document.querySelectorAll(VIEW_LINK).length === 0) {
    await new Promise((r) => setTimeout(r, 500));
  }
  return {
    cards: readCards(),
    page: { url: location.href, title: document.title, bodyText: document.body.innerText.slice(0, 2000), status: 200 },
  };
}

// One page: its jobs, and whether the pager says another page follows.
async function readPage() {
  const result = await readWhenReady();
  return {
    ...result,
    hasNext: Boolean(findNextButton()),
    pager: pagerLabels(),
    version: chrome.runtime.getManifest().version,
    diag: {
      visibility: document.visibilityState,
      focused: document.hasFocus(),
      urlAfter: (location.pathname + location.search).slice(0, 200),
      cardsNow: result.cards.length,
    },
  };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "linkedin-watch-read") return false;
  readPage().then(sendResponse);
  return true;
});
