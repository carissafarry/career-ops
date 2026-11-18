import { pipelineSummary } from "@/lib/career-ops";
import { loadInboxPayload } from "@/lib/inbox-payload";

export const runtime = "nodejs";
export const dynamic = "force-dynamic"; // always read fresh local files

// The Inbox tab's postings (with fit) and scan selector data. The Pipeline page
// fetches this in the background while a tracker tab is open, so switching to
// the Inbox does not wait for a page render.
export async function GET() {
  return Response.json(loadInboxPayload(pipelineSummary().inbox));
}
