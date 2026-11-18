/**
 * company-research-store.mjs — the saved "Evaluate company" report for one application.
 *
 * One Markdown file per application under data/company-research/ (user layer,
 * gitignored). The agent only reports; the backend saves what it said.
 */
import fs from "node:fs";
import path from "node:path";

/** @param {string} n */
export function isResearchKey(n) {
  return typeof n === "string" && /^\d{1,6}$/.test(n);
}

/** @param {string} root @param {string} n */
function filePath(root, n) {
  return path.join(root, "data", "company-research", `${n}.md`);
}

/**
 * The agent's closing VERDICT line is for the run log; the saved report omits it.
 * @param {string} text
 */
export function reportBody(text) {
  return text.replace(/\n*^\s*VERDICT:.*$/gim, "").trim();
}

/**
 * @param {string} root
 * @param {string} n
 * @param {string} text
 * @returns {boolean} whether anything was saved
 */
export function saveCompanyResearch(root, n, text) {
  if (!isResearchKey(n)) return false;
  const body = reportBody(text);
  if (!body) return false;
  const file = filePath(root, n);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${body}\n`);
  fs.renameSync(tmp, file);
  return true;
}

/**
 * @param {string} root
 * @param {string} n
 * @returns {{markdown: string, at: Date} | null}
 */
export function readCompanyResearch(root, n) {
  if (!isResearchKey(n)) return null;
  try {
    const file = filePath(root, n);
    const markdown = fs.readFileSync(file, "utf8");
    return markdown.trim() ? { markdown, at: fs.statSync(file).mtime } : null;
  } catch {
    return null;
  }
}
