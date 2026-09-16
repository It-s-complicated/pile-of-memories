import { command } from "$app/server";
import { error } from "@sveltejs/kit";
import { enrichmentInputSchema, enrichmentResponseSchema } from "#lib/enrichment.js";
import { withDeadline } from "#lib/server/deadline.js";
import {
  enrichMemory as enrichMemoryWithProvider,
  EnrichmentExecutionError,
} from "#lib/server/enrichment.js";
import { requirePrivateBoard } from "#lib/server/private-board.js";

const RESPONSE_DEADLINE_MS = 60_000;
const EMPTY_USAGE = {
  promptTokens: null,
  completionTokens: null,
  totalTokens: null,
  providerCost: null,
} as const;

export const enrichMemory = command(enrichmentInputSchema, async (input) => {
  requirePrivateBoard();

  let execution;
  try {
    // The provider call cooperatively aborts after 55 seconds. This outer race caps the response
    // at 60 seconds if upstream cancellation stalls, but does not itself cancel remaining work.
    execution = await withDeadline(
      enrichMemoryWithProvider(input),
      RESPONSE_DEADLINE_MS,
      () => new EnrichmentExecutionError("provider_timeout", RESPONSE_DEADLINE_MS, EMPTY_USAGE),
    );
  } catch {
    error(502, "AI enrichment is unavailable");
  }

  return enrichmentResponseSchema.parse({ ...execution.output, attemptId: crypto.randomUUID() });
});
