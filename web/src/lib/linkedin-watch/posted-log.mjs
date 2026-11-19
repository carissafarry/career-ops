// The hour LinkedIn gave a job, kept for the jobs added to the Pipeline. The core's pipeline.md stores only a date
// (`postedAt: YYYY-MM-DD`), so the exact estimate lives here, keyed by the job's URL, and the Pipeline reads it
// back to show "5h ago" for these rows.
import fs from "node:fs";
import path from "node:path";

const HEADER = "url\tposted_at\n";
const MAX_ROWS = 2000;
const clean = (s) => String(s ?? "").replace(/[\t\r\n]+/g, " ").trim();

/** url -> ISO time, from the file; {} when there is none. */
export function readPosted(file) {
  const map = {};
  let text = "";
  try {
    text = fs.readFileSync(file, "utf8");
  } catch {
    return map;
  }
  for (const line of text.split("\n").slice(1)) {
    const [url, at] = line.split("\t");
    if (url && at && Number.isFinite(Date.parse(at))) map[url] = at;
  }
  return map;
}

/** Adds rows ({url, postedAt: ISO}); a URL recorded again replaces its earlier time. Keeps the newest MAX_ROWS. */
export function recordPosted(file, rows) {
  const usable = rows.filter((r) => r.url && Number.isFinite(Date.parse(r.postedAt)));
  if (usable.length === 0) return;
  const map = readPosted(file);
  for (const r of usable) {
    delete map[r.url]; // re-insert so the newest are last
    map[r.url] = new Date(r.postedAt).toISOString();
  }
  const entries = Object.entries(map).slice(-MAX_ROWS);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, HEADER + entries.map(([u, a]) => `${clean(u)}\t${a}`).join("\n") + "\n");
  fs.renameSync(tmp, file);
}

/** Jobs with `postedAtExact` (ISO) added where the map has their URL. */
export const withPostedExact = (jobs, map) => jobs.map((j) => (map[j.url] ? { ...j, postedAtExact: map[j.url] } : j));
