import { error, json } from "@sveltejs/kit";
import { parseCreateCardRequest } from "$lib/card";
import { insertCard, listCards, recordEnrichmentReview } from "$lib/server/database";
import { buildReviewAnalyticsJob, reportAnalyticsFailure } from "$lib/server/enrichment-analytics";
import { requirePrivateBoard } from "$lib/server/private-board";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async () => {
  requirePrivateBoard();
  return json(await listCards());
};

export const POST: RequestHandler = async ({ request }) => {
  requirePrivateBoard();
  const input = parseCreateCardRequest(await request.json().catch(() => null));
  if (!input) error(400, "Invalid card");

  const card = await insertCard(input.card);
  if (input.creation) {
    try {
      const job = buildReviewAnalyticsJob(card, input.creation);
      void recordEnrichmentReview(job).catch(() => reportAnalyticsFailure("record_review"));
    } catch {
      reportAnalyticsFailure("build_review");
    }
  }

  return json(card, { status: 201 });
};
