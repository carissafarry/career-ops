import { NextResponse } from "next/server";
import path from "node:path";
import { careerOpsRoot, rootScript } from "@/lib/career-ops";
import { ingest } from "@/lib/linkedin-watch/api.mjs";
import { runFilterWorker } from "@/lib/linkedin-watch/filter-runner.mjs";
import { watchPaths } from "@/lib/linkedin-watch/store.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The user's filters run the core scanner's own title and location rules, in a separate Node process
// so a core updated under the running app is always read fresh (see filter-worker.mjs).
const runFilter = (filters: unknown, cards: unknown[]) =>
  runFilterWorker({
    workerPath: path.join(process.cwd(), "src", "lib", "linkedin-watch", "filter-worker.mjs"),
    corePath: rootScript("scan"),
    filters,
    cards,
  });

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const r = await ingest(watchPaths(careerOpsRoot()), body, request.headers.get("origin"), { runFilter });
  return NextResponse.json(r.body, { status: r.status });
}
