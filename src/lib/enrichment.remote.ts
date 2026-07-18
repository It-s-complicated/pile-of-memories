import { command } from "$app/server";
import { error } from "@sveltejs/kit";
import { enrichmentInputSchema, enrichmentResponseSchema } from "$lib/enrichment";
import type { EnrichmentUsage } from "$lib/enrichment-analytics";
import {
  recordEnrichmentAttemptFailed,
  recordEnrichmentAttemptStarted,
  recordEnrichmentAttemptSucceeded,
} from "$lib/server/database";
import { withDeadline } from "$lib/server/deadline";
import {
  buildAttemptStarted,
  buildAttemptSucceeded,
  hasAnalyticsFingerprintKey,
  reportAnalyticsFailure,
} from "$lib/server/enrichment-analytics";
import {
  enrichMemory as enrichMemoryWithProvider,
  EnrichmentExecutionError,
} from "$lib/server/enrichment";
import { requirePrivateBoard } from "$lib/server/private-board";

const RESPONSE_DEADLINE_MS = 60_000;
const EMPTY_USAGE: EnrichmentUsage = {
  promptTokens: null,
  completionTokens: null,
  totalTokens: null,
  providerCost: null,
};

export const enrichMemory = command(enrichmentInputSchema, async (input) => {
  requirePrivateBoard();

  const attemptId = crypto.randomUUID();
  const started = buildAttemptStarted(attemptId, input);
  void recordEnrichmentAttemptStarted(started).catch(() =>
    reportAnalyticsFailure("record_attempt_started"),
  );

  let execution;
  try {
    // The provider call cooperatively aborts after 55 seconds. This outer race caps the response
    // at 60 seconds if upstream cancellation stalls, but does not itself cancel remaining work.
    execution = await withDeadline(
      enrichMemoryWithProvider(input),
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
    const succeeded = buildAttemptSucceeded(started, input, execution.output, execution);
    if (!hasAnalyticsFingerprintKey()) reportAnalyticsFailure("fingerprint_key_missing");
    void recordEnrichmentAttemptSucceeded(succeeded).catch(() =>
      reportAnalyticsFailure("record_attempt_succeeded"),
    );
  } catch {
    reportAnalyticsFailure("build_attempt_succeeded");
  }

  return enrichmentResponseSchema.parse({ ...execution.output, attemptId });
});
