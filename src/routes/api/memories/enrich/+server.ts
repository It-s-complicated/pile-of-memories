import { error, json } from "@sveltejs/kit";
import { enrichmentInputSchema } from "$lib/enrichment";
import { enrichMemory } from "$lib/server/enrichment";
import { requirePrivateBoard } from "$lib/server/private-board";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = async ({ request }) => {
  requirePrivateBoard();
  const input = enrichmentInputSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) error(400, "Invalid enrichment request");

  try {
    return json(await enrichMemory(input.data));
  } catch {
    error(502, "AI enrichment is unavailable");
  }
};
