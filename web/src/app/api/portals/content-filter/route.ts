import path from "node:path";
import * as yaml from "js-yaml";
import { careerOpsRoot, portalsConfigPath } from "@/lib/career-ops";
import { resolveCodeRoot } from "@/lib/core/code-root.mjs";
import { atomicWriteWithBackup } from "@/lib/core/safe-write";
import { CONTENT_KEYS, editContentFilterText, isMapping, loadPortalsDocument, PortalsConfigError, splitContentEntry } from "@/lib/portals-config.mjs";
import { readJsonObject } from "@/lib/json-body";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The words a posting's description must mention (positive) or must not mention
// (negative): `content_filter` in portals.yml, a USER-LAYER file. Read and written
// as text, so its comments and every other block survive; a shape the text edit
// cannot place is refused instead of rewritten. The scanner and Explore read the
// file on each run, so a change applies to the next scan.

const MAX_ENTRY = 80;
const MAX_LIST = 300;

function load() {
  const file = portalsConfigPath(careerOpsRoot());
  const template = path.join(resolveCodeRoot(process.cwd(), process.env), "templates", "portals.example.yml");
  return { file, ...loadPortalsDocument(file, template) };
}

function summarize(doc: Record<string, unknown>) {
  const section = isMapping(doc.content_filter) ? (doc.content_filter as Record<string, unknown>) : {};
  const list = (key: string) => (Array.isArray(section[key]) ? (section[key] as unknown[]).filter((v): v is string => typeof v === "string") : []);
  return {
    positive: list("positive"),
    negative: list("negative"),
    minMatch: typeof section.min_match === "number" ? section.min_match : null,
    rescueTitleMisses: section.rescue_title_misses === true,
    scopedByTitle: isMapping(section.by_title_keyword) && Object.keys(section.by_title_keyword as object).length > 0,
  };
}

function failure(error: unknown) {
  const invalid = error instanceof PortalsConfigError && error.kind === "invalid-user-config";
  return Response.json({ error: error instanceof Error ? error.message : "could not load portals.yml" }, { status: invalid ? 409 : 500 });
}

export async function GET() {
  try {
    const { doc, seeded } = load();
    return Response.json({ ...summarize(doc), fileExists: !seeded });
  } catch (error) {
    return failure(error);
  }
}

function entries(value: unknown): string[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return null;
  const out: string[] = [];
  for (const raw of value) {
    if (typeof raw !== "string") return null;
    const text = raw.trim();
    if (!text) continue;
    out.push(text);
  }
  return out;
}

async function post(req: Request) {
  const body = await readJsonObject<{ key?: string; add?: unknown; remove?: unknown }>(req);
  if (!body) return Response.json({ error: "bad json" }, { status: 400 });
  const key = body.key;
  if (typeof key !== "string" || !(CONTENT_KEYS as string[]).includes(key)) {
    return Response.json({ error: "key must be positive or negative" }, { status: 400 });
  }
  const add = entries(body.add);
  const remove = entries(body.remove);
  if (add === null || remove === null) return Response.json({ error: "add and remove must be lists of text" }, { status: 400 });
  for (const entry of add) {
    if (entry.length > MAX_ENTRY) return Response.json({ error: `an entry is longer than ${MAX_ENTRY} characters` }, { status: 400 });
    if (/[\r\n]/.test(entry)) return Response.json({ error: "an entry must be on one line" }, { status: 400 });
    if (!splitContentEntry(entry).text) return Response.json({ error: "an entry needs a word after word: or stem:" }, { status: 400 });
  }
  if (add.length === 0 && remove.length === 0) return Response.json({ error: "nothing to change" }, { status: 400 });

  let loaded: ReturnType<typeof load>;
  try {
    loaded = load();
  } catch (error) {
    return failure(error);
  }
  const { file, doc, source } = loaded;
  const before = summarize(doc);
  const current = key === "positive" ? before.positive : before.negative;
  if (current.length + add.length > MAX_LIST) return Response.json({ error: `a list holds at most ${MAX_LIST} entries` }, { status: 400 });

  // The scanner refuses to start when `min_match` is above the number of positive
  // entries, or `rescue_title_misses` has none, so never write a file in that state.
  if (key === "positive") {
    const norm = (e: string) => e.trim().toLowerCase();
    const next = new Set([...current.filter((c) => !remove.some((r) => norm(r) === norm(c))), ...add].map(norm));
    if (before.minMatch !== null && next.size < before.minMatch) {
      return Response.json({ error: `portals.yml asks for at least ${before.minMatch} matching words (min_match), so the list cannot go below ${before.minMatch}` }, { status: 409 });
    }
    if (before.rescueTitleMisses && next.size === 0) {
      return Response.json({ error: "portals.yml lets descriptions rescue titles (rescue_title_misses), which needs at least one word here" }, { status: 409 });
    }
  }

  const text = editContentFilterText(source, key as "positive" | "negative", { add, remove });
  if (text === null) {
    return Response.json({ error: "portals.yml has this list in a shape the page cannot edit safely (for example on one line in square brackets). Edit it in the file." }, { status: 409 });
  }
  try {
    if (text !== source) atomicWriteWithBackup(file, text);
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "write failed" }, { status: 500 });
  }
  return Response.json({ ok: true, ...summarize(yaml.load(text) as Record<string, unknown>), fileExists: true });
}

export async function POST(req: Request) {
  try {
    return await post(req);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "could not change portals.yml" }, { status: 500 });
  }
}
