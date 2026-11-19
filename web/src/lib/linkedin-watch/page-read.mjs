// Normalises raw cards from the extension and recognises pages that mean "stop".
// Every wording pattern lives in HALT_PATTERNS so drift is a one-place fix.
export const HALT_PATTERNS = {
  checkpointUrl: /\/checkpoint\b/i,
  loginUrl: /\/(login|authwall|uas\/login)\b/i,
  captchaText: /security verification|quick security check/i,
};

export function normalizeRawCards(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const r of raw) {
    const id = r && typeof r.jobId === "string" ? r.jobId.trim() : "";
    if (!/^\d+$/.test(id)) continue;
    out.push({
      id,
      title: String(r.title ?? "").trim(),
      company: String(r.company ?? "").trim(),
      location: String(r.location ?? "").trim(),
      link: `https://www.linkedin.com/jobs/view/${id}/`,
      postedText: String(r.posted ?? "").trim(),
    });
  }
  return out;
}

export function detectHalt(page) {
  if (page.status === 429) return "rate-limited";
  if (HALT_PATTERNS.checkpointUrl.test(page.url)) return "checkpoint";
  if (HALT_PATTERNS.loginUrl.test(page.url)) return "login-wall";
  if (HALT_PATTERNS.captchaText.test(`${page.title}\n${page.bodyText}`)) return "captcha";
  return null;
}
