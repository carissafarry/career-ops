import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { careerOpsRoot } from "@/lib/career-ops";
import { cvPdfDisposition } from "@/lib/content-disposition.mjs";
import { findLastCv } from "@/lib/last-cv.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The newest generated CV in output/, whichever job it was made for.
// ?info=1 returns its name and time as JSON; otherwise the PDF itself (?download=1 to save it).
export async function GET(req: NextRequest) {
  const last = findLastCv(path.join(careerOpsRoot(), "output"));
  if (req.nextUrl.searchParams.get("info") === "1") {
    return NextResponse.json(last ? { name: last.name, at: last.at.toISOString() } : { name: null, at: null }, {
      headers: { "Cache-Control": "no-store" },
    });
  }
  if (!last) return new Response("No CV has been generated yet.", { status: 404 });
  try {
    return new Response(new Uint8Array(fs.readFileSync(last.file)), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": cvPdfDisposition(last.file, req.nextUrl.searchParams.get("download")),
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return new Response("could not read the PDF", { status: 500 });
  }
}
