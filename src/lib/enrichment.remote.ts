import { command } from "$app/server";
import { error } from "@sveltejs/kit";
import {
  enrichmentInputSchema,
  enrichmentResponseSchema,
  memorySourceIds,
} from "#lib/enrichment.js";
import type { EnrichmentUsage } from "#lib/enrichment-analytics.js";
import {
  listLabels,
  listCards,
  recordEnrichmentAttemptFailed,
  recordEnrichmentAttemptStarted,
  recordEnrichmentAttemptSucceeded,
} from "#lib/server/database.js";
import { withDeadline } from "#lib/server/deadline.js";
import {
  buildAttemptStarted,
  buildAttemptSucceeded,
  hasAnalyticsFingerprintKey,
  reportAnalyticsFailure,
} from "#lib/server/enrichment-analytics.js";
import {
  enrichMemory as enrichMemoryWithProvider,
  EnrichmentExecutionError,
} from "#lib/server/enrichment.js";
import { requirePrivateBoard } from "#lib/server/private-board.js";

const RESPONSE_DEADLINE_MS = 60_000;
const EMPTY_USAGE: EnrichmentUsage = {
  promptTokens: null,
  completionTokens: null,
  totalTokens: null,
  providerCost: null,
};

export const enrichMemory = command(enrichmentInputSchema, async (input) => {
  requirePrivateBoard();

  let vocabulary;
  try {
    vocabulary = await listLabels();
  } catch {
    error(503, "Could not load tag and topic definitions.");
  }
  const attemptId = crypto.randomUUID();
  const started = buildAttemptStarted(attemptId, input, vocabulary);
  void recordEnrichmentAttemptStarted(started).catch(() =>
    reportAnalyticsFailure("record_attempt_started"),
  );

  let execution;
  try {
    const sourceIds = input.sourceIds ?? memorySourceIds(input.description);
    const sources = sourceIds.length ? await listCards() : [];
    const sourceContext = sources
      .filter((card) => sourceIds.includes(card.id))
      .map(({ title, body, tags, topics }) => ({
        title,
        body: body.slice(0, 2_000),
        tags,
        topics,
      }));
    // The provider call cooperatively aborts after 55 seconds. This outer race caps the response
    // at 60 seconds if upstream cancellation stalls, but does not itself cancel remaining work.
    execution = await withDeadline(
      enrichMemoryWithProvider({ ...input, sourceContext }, vocabulary),
      RESPONSE_DEADLINE_MS,
      () => new EnrichmentExecutionError("provider_timeout", RESPONSE_DEADLINE_MS, EMPTY_USAGE),
    );
  } catch (caught) {
    const failure =
      caught instanceof EnrichmentExecutionError
        ? caught
        : new EnrichmentExecutionError("unknown", 0, EMPTY_USAGE);
    void recordEnrichmentAttemptFailed({
      ...started,
      errorCode: failure.errorCode,
      latencyMs: failure.latencyMs,
      usage: failure.usage,
    }).catch(() => reportAnalyticsFailure("record_attempt_failed"));
    error(502, "AI enrichment is unavailable");
  }

  try {
    const succeeded = buildAttemptSucceeded(started, vocabulary, execution.output, execution);
    if (!hasAnalyticsFingerprintKey()) reportAnalyticsFailure("fingerprint_key_missing");
    void recordEnrichmentAttemptSucceeded(succeeded).catch(() =>
      reportAnalyticsFailure("record_attempt_succeeded"),
    );
  } catch {
    reportAnalyticsFailure("build_attempt_succeeded");
  }

  return enrichmentResponseSchema.parse({ ...execution.output, attemptId });
});
