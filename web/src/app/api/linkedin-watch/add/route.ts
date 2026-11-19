import { NextResponse } from "next/server";
import { careerOpsRoot } from "@/lib/career-ops";
import { addOffersToPipeline } from "@/lib/core/pipeline";
import { addPostings } from "@/lib/linkedin-watch/api.mjs";
import { watchPaths } from "@/lib/linkedin-watch/store.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Body: { ids: string[] } (or a single { id }). Adds the postings to the pipeline inbox in one write.
export async function POST(request: Request) {
  let ids: string[] = [];
  try {
    const body = await request.json();
    ids = Array.isArray(body?.ids) ? body.ids.map(String) : body?.id ? [String(body.id)] : [];
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const r = await addPostings(watchPaths(careerOpsRoot()), ids, (offers: unknown[]) =>
    addOffersToPipeline(offers as Parameters<typeof addOffersToPipeline>[0]),
  );
  return NextResponse.json(r.body, { status: r.status });
}
