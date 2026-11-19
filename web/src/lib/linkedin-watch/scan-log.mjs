// Writes what a LinkedIn poll found into data/scan-origin.tsv, so /scans lists it as a scan of its own.
// Columns match the file's header: url, scan, started_at, company, role, location, posted_at.
// scan-history.tsv is not touched, so the scanner's dedup is unaffected.
import fs from "node:fs";
import path from "node:path";

const HEADER = "url\tscan\tstarted_at\tcompany\trole\tlocation\tposted_at\n";
const clean = (s) => String(s ?? "").replace(/[\t\r\n]+/g, " ").trim();

export const linkedinScanId = (iso) => `linkedin-${iso}`;

export function originLines(postings, scanId, startedAt) {
  return postings.map((p) => [p.link, scanId, startedAt, clean(p.company), clean(p.title), clean(p.location), ""].join("\t"));
}

function endsWithNewline(file) {
  const fd = fs.openSync(file, "r");
  try {
    const { size } = fs.fstatSync(fd);
    if (size === 0) return true;
    const buf = Buffer.alloc(1);
    fs.readSync(fd, buf, 0, 1, size - 1);
    return buf[0] === 0x0a;
  } finally {
    fs.closeSync(fd);
  }
}

const POLL_HEADER = "started_at\tread\tkept\tnew\tbaseline\n";
const POLL_LOG_MAX = 600; // about two days of polls at a 5 minute interval

/** One line per poll (also the ones that found nothing), so /scans can show the watcher's history. */
export function appendPollLog(file, { startedAt, read, kept, added, baseline }) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const line = [startedAt, read, kept, added, baseline ? 1 : 0].join("\t");
  if (!fs.existsSync(file)) return fs.writeFileSync(file, POLL_HEADER + line + "\n");
  const lines = fs.readFileSync(file, "utf8").split("\n").filter(Boolean);
  lines.push(line);
  if (lines.length - 1 > POLL_LOG_MAX) lines.splice(1, lines.length - 1 - POLL_LOG_MAX);
  fs.writeFileSync(file, lines.join("\n") + "\n");
}

/** The newest line of the poll log, or null. */
export function readLastPoll(file) {
  try {
    const rows = fs.readFileSync(file, "utf8").split("\n").filter(Boolean).slice(1);
    const last = rows.at(-1)?.split("\t");
    if (!last) return null;
    const [startedAt, read, kept, added, baseline] = last;
    return { startedAt, read: Number(read), kept: Number(kept), added: Number(added), baseline: baseline === "1" };
  } catch {
    return null;
  }
}

export function appendOrigin(file, lines) {
  if (lines.length === 0) return;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, HEADER + lines.join("\n") + "\n");
    return;
  }
  fs.appendFileSync(file, (endsWithNewline(file) ? "" : "\n") + lines.join("\n") + "\n");
}
