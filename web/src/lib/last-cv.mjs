/**
 * last-cv.mjs — the most recently generated tailored CV, whichever job it was for.
 *
 * Generated CVs are kept in output/ as cv-{candidate}-{report}-{company}-{date}.pdf.
 * The newest one by modification time is the "last generated CV". Plain .mjs so it
 * can be tested directly under node --test.
 */
import fs from "node:fs";
import path from "node:path";

/**
 * @param {string} outputDir
 * @returns {{file: string, name: string, at: Date} | null}
 */
export function findLastCv(outputDir) {
  let names;
  try {
    names = fs.readdirSync(outputDir);
  } catch {
    return null;
  }
  let best = null;
  for (const name of names) {
    if (!/^cv-.+\.pdf$/i.test(name)) continue;
    const file = path.join(outputDir, name);
    try {
      const stat = fs.lstatSync(file);
      // A symlink could point outside output/, so only plain files count.
      if (!stat.isFile()) continue;
      if (!best || stat.mtimeMs > best.at.getTime()) best = { file, name, at: stat.mtime };
    } catch {
      /* removed between readdir and stat */
    }
  }
  return best;
}
