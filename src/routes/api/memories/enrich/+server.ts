import { error, json } from "@sveltejs/kit";
import { enrichmentRequestSchema } from "$lib/enrichment";
import {
  recordEnrichmentAttemptFailed,
  recordEnrichmentAttemptStarted,
  recordEnrichmentAttemptSucceeded,
} from "$lib/server/database";
import {
  buildAttemptStarted,
  buildAttemptSucceeded,
  hasAnalyticsFingerprintKey,
  reportAnalyticsFailure,
} from "$lib/server/enrichment-analytics";
import { enrichMemory, EnrichmentExecutionError } from "$lib/server/enrichment";
import { requirePrivateBoard } from "$lib/server/private-board";
import type { EnrichmentUsage } from "$lib/enrichment-analytics";
import type { RequestHandler } from "./$types";

const EMPTY_USAGE: EnrichmentUsage = {
  promptTokens: null,
  completionTokens: null,
  totalTokens: null,
  providerCost: null,
};

export const POST: RequestHandler = async ({ request }) => {
  requirePrivateBoard();
  const parsed = enrichmentRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) error(400, "Invalid enrichment request");

  const { attemptId, ...input } = parsed.data;
  const started = buildAttemptStarted(attemptId, input);
  void recordEnrichmentAttemptStarted(started).catch(() =>
    reportAnalyticsFailure("record_attempt_started"),
  );

  let execution;
  try {
    execution = await enrichMemory(input);
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

  return json({ ...execution.output, attemptId });
};
