import { NextResponse } from "next/server";
import { careerOpsRoot } from "@/lib/career-ops";
import { getExtensionConfig } from "@/lib/linkedin-watch/api.mjs";
import { watchPaths } from "@/lib/linkedin-watch/store.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(getExtensionConfig(watchPaths(careerOpsRoot())), { headers: { "Cache-Control": "no-store" } });
}
