import { NextResponse } from "next/server";
import { careerOpsRoot } from "@/lib/career-ops";
import { applyAction, getOverview } from "@/lib/linkedin-watch/api.mjs";
import { watchPaths } from "@/lib/linkedin-watch/store.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(getOverview(watchPaths(careerOpsRoot())), { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const r = applyAction(watchPaths(careerOpsRoot()), body);
  return NextResponse.json(r.body, { status: r.status });
}
