import { careerOpsRoot, readApplications, readInbox, readLinkedReport, readScanHistoryLines } from "@/lib/career-ops";
import { getNormalizeTextKey } from "@/lib/core/text-key";
import { getAggregatorRule } from "@/lib/core/aggregator-id";
import { evaluatedKeys, isEvaluated } from "@/lib/whats-new-suppression.mjs";
import type { DiscoveredOffer } from "@/lib/explore";
import { collectWhatsNew, POSTED_AT_COLUMN, postedTimestamp, resolveOfferLimit } from "@/lib/whats-new.mjs";
import { rankOffers } from "@/lib/core/inbox-rank.mjs";
import { loadFitTargets } from "@/lib/inbox-fit-profile.mjs";
import { loadWorkplacePolicy } from "@/lib/core/workplace-policy.mjs";
import { locationKeys } from "@/lib/location-geo.mjs";
import { inPipelineUrls } from "@/lib/inbox-pending.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The SUPPLY loop, ZERO tokens: "new matches this week" = roles surfaced by past
// free scans (data/scan-history.tsv) in the last N days that the user hasn't
// evaluated yet. No scan runs here — it reads the history a past scan already
// wrote, so the home stays instant + free (directly answers the #1 token-cost
// complaint). cols: url, first_seen, portal, title, company, status, location.
// Company matching keys come from the CORE (see lib/core/text-key.ts), never a
// local reimplementation. The previous ASCII-only key deleted every non-Latin
// letter, so "Škoda" collided with "Koda" — suppressing a real offer as
// "already evaluated" — and "日本電産" keyed to the empty string (#2666).

export async function GET(req: Request) {
  const searchParams = new URL(req.url).searchParams;
  const days = Math.min(30, Math.max(1, Number(searchParams.get("days")) || 7));
  // Home only needs enough offers for its cards; Explore's “See all” hand-off
  // asks for more. Both stay finite — `count` is always complete, so the true
  // total is free while the rendered list keeps a ceiling (see MAX_OFFER_LIMIT).
  const offerLimit = resolveOfferLimit(searchParams.get("limit"));
  const cutoff = Date.now() - days * 86_400_000;
  let rows: string[] | null;
  try {
    rows = readScanHistoryLines();
  } catch (err) {
    return Response.json(
      { error: `scan history could not be read: ${(err as Error)?.message ?? "unknown error"}`, offers: [], count: 0 },
      { status: 500 },
    );
  }
  if (rows === null) return Response.json({ offers: [], count: 0 });

  // Roles already evaluated → don't resurface as "new". Keyed on company AND
  // role, not company alone: suppressing by employer removed that employer's
  // entire board after one evaluation (#3131), and refined by posting URL when
  // both sides have one (#5684), by posting id on an aggregator. See
  // lib/whats-new-suppression.
  const normalizeTextKey = await getNormalizeTextKey();
  const aggregator = await getAggregatorRule();
  const applications = readApplications();
  const evaluated = evaluatedKeys(applications, normalizeTextKey, readLinkedReport);
  // Roles the user took out of the pipeline (checked off in pipeline.md, no tracker
  // row) stay out of "fresh" too, so removing one is a decision, not a hiding.
  const inbox = readInbox(applications);
  const counted = new Set(inPipelineUrls(inbox, applications));
  const dismissed = new Set(inbox.filter((job) => job.done && !counted.has(job.url)).map((job) => job.url));

  let workplacePolicy: (location: string, title: string) => { eligible: boolean };
  try { workplacePolicy = await loadWorkplacePolicy(careerOpsRoot()); }
  catch (error) {
    return Response.json({ error: `workplace geography policy could not be read: ${(error as Error).message}`, offers: [], count: 0 }, { status: 500 });
  }
  const toOffer = (c: string[]): DiscoveredOffer | null => {
    const [url, firstSeen, portal, title, company, status, location] = c;
    if (!url || !/^https?:\/\//i.test(url)) return null;
    if (status && /skipped|expired/i.test(status)) return null;
    if (dismissed.has(url)) return null;
    if (isEvaluated(evaluated, normalizeTextKey, company, title, url, aggregator)) return null;
    if (!workplacePolicy(location || "", title || "").eligible) return null;
    return {
      url,
      company: (company || "").trim(),
      title: (title || "").trim(),
      location: (location || "").trim(),
      // The date the employer posted it; first seen by a scan only when that is unknown.
      postedAt: postedTimestamp(c[POSTED_AT_COLUMN]) !== null ? c[POSTED_AT_COLUMN].trim() : /^\d{4}-\d{2}-\d{2}$/.test(firstSeen || "") ? firstSeen : "",
      ats: (portal || "").replace(/-full$/, "").trim() || "other",
      source: "whats-new",
    };
  };

  // Same rule as the scan history above, for the linked reports: a missing one
  // is "URL unknown", any other read failure throws from readLinkedReport. The
  // reads are lazy, inside toOffer, so they surface here.
  try {
    const { offers: pool, count } = collectWhatsNew(rows, {
      cutoff,
      toOffer,
      offerLimit: Number.POSITIVE_INFINITY,
    });
    const targets = loadFitTargets();
    let ranked: DiscoveredOffer[];
    if (searchParams.get("groups") === "1") {
      // Explore hides what is already in the pipeline by default. If the ceiling were
      // applied first, the best roles (the ones the pipeline already holds) would fill
      // it and push every role not yet in the pipeline out of view. So each group gets
      // its own ceiling: roles not in the pipeline first, then the ones that are.
      const waiting = new Set(inbox.filter((job) => !job.done).map((job) => job.url));
      const fresh = pool.filter((o: { url: string }) => !waiting.has(o.url));
      const held = pool.filter((o: { url: string }) => waiting.has(o.url));
      ranked = [
        ...(rankOffers(fresh, targets, offerLimit) as DiscoveredOffer[]),
        ...(rankOffers(held, targets, offerLimit) as DiscoveredOffer[]),
      ];
    } else {
      ranked = rankOffers(pool, targets, offerLimit) as DiscoveredOffer[];
    }
    const offers = ranked.map((o) => ({ ...o, locationKeys: locationKeys(o.location ?? "") }));
    return Response.json({ offers, count });
  } catch (err) {
    return Response.json(
      { error: (err as Error)?.message ?? "unknown error", offers: [], count: 0 },
      { status: 500 },
    );
  }
}
