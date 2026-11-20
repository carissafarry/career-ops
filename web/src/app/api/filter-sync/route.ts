import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { careerOpsRoot } from "@/lib/career-ops";
import { cleanItems } from "@/lib/filter-sync.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// data/ is the user layer and is never committed, so the saved filters stay local.
const file = () => path.join(careerOpsRoot(), "data", "web-filters.json");

export async function GET() {
  try {
    const saved = JSON.parse(fs.readFileSync(file(), "utf8")) as { savedAt?: string; items?: unknown };
    return NextResponse.json({ savedAt: saved.savedAt ?? null, items: cleanItems(saved.items) }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ savedAt: null, items: {} }, { headers: { "Cache-Control": "no-store" } });
  }
}

export async function PUT(request: Request) {
  let body: { items?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const items = cleanItems(body?.items);
  const savedAt = new Date().toISOString();
  const target = file();
  const tmp = `${target}.${process.pid}.tmp`;
  try {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(tmp, JSON.stringify({ savedAt, items }, null, 2));
    fs.renameSync(tmp, target);
  } catch (err) {
    return NextResponse.json({ error: `Could not save the filters: ${(err as Error).message}` }, { status: 500 });
  }
  return NextResponse.json({ savedAt, count: Object.keys(items).length });
}
