import { ANALYTICS_FINGERPRINT_KEY } from "$app/env/private";
import { createHmac } from "node:crypto";
import { z } from "zod";
import type { Card } from "#lib/card.js";
import {
  normalizeAnalyticsTags,
  type CardCreationProvenance,
  type EnrichmentAttemptStarted,
  type EnrichmentAttemptSucceeded,
  type EnrichmentReviewJob,
} from "#lib/enrichment-analytics.js";
import type { EnrichmentInput, EnrichmentOutput } from "#lib/enrichment.js";
import {
  ENRICHMENT_MODEL,
  ENRICHMENT_PROMPT_VERSION,
  ENRICHMENT_PROVIDER,
  type EnrichmentExecution,
} from "./enrichment";

const fingerprintKeySchema = z.string().min(32).nullable().catch(null);
const MAX_REVIEW_DURATION_MS = 2_147_483_647;

function fingerprint(value: string, key: string): string {
  return createHmac("sha256", key).update(value).digest("base64url");
}

function fingerprintTitle(title: string, key: string): string {
  return fingerprint(title.trim(), key);
}

function fingerprintTags(tags: string[], key: string): string[] {
  return normalizeAnalyticsTags(tags).map((tag) => fingerprint(tag, key));
}

export function buildAttemptStarted(
  attemptId: string,
  input: EnrichmentInput,
): EnrichmentAttemptStarted {
  return {
    id: attemptId,
    provider: ENRICHMENT_PROVIDER,
    model: ENRICHMENT_MODEL,
    promptVersion: ENRICHMENT_PROMPT_VERSION,
    inputCharacterCount: input.description.length,
    existingTagCount: input.existingTags.length,
  };
}

export function buildAttemptSucceeded(
  started: EnrichmentAttemptStarted,
  input: EnrichmentInput,
  output: EnrichmentOutput,
  execution: EnrichmentExecution,
  fingerprintKeyValue: string | undefined = ANALYTICS_FINGERPRINT_KEY,
): EnrichmentAttemptSucceeded {
  const key = fingerprintKeySchema.parse(fingerprintKeyValue);
  const normalizedGeneratedTags = normalizeAnalyticsTags(output.tags);
  const vocabulary = new Set(normalizeAnalyticsTags(input.existingTags));

  return {
    ...started,
    latencyMs: execution.latencyMs,
    usage: execution.usage,
    generatedTitleFingerprint: key ? fingerprintTitle(output.title, key) : null,
    generatedTagFingerprints: key ? fingerprintTags(output.tags, key) : null,
    generatedTagCount: normalizedGeneratedTags.length,
    vocabularyReuseCount: normalizedGeneratedTags.filter((tag) => vocabulary.has(tag)).length,
  };
}

function reviewDuration(reviewStartedAt?: string): number | null {
  if (!reviewStartedAt) return null;
  return Math.min(Math.max(Date.now() - Date.parse(reviewStartedAt), 0), MAX_REVIEW_DURATION_MS);
}

export function buildReviewAnalyticsJob(
  card: Card,
  creation: CardCreationProvenance,
  fingerprintKeyValue: string | undefined = ANALYTICS_FINGERPRINT_KEY,
): EnrichmentReviewJob {
  const key = fingerprintKeySchema.parse(fingerprintKeyValue);
  const finalTags = [...card.tags, ...card.topics];
  const hasFingerprints = creation.resultSource !== "fallback" && key !== null;

  return Object.freeze({
    id: crypto.randomUUID(),
    attemptId: creation.enrichmentAttemptId,
    cardId: card.id,
    resultSource: creation.resultSource,
    finalTitleFingerprint: hasFingerprints ? fingerprintTitle(card.title, key) : null,
    finalTagFingerprints: hasFingerprints ? Object.freeze(fingerprintTags(finalTags, key)) : null,
    finalTagCount: normalizeAnalyticsTags(finalTags).length,
    reviewDurationMs: reviewDuration(creation.reviewStartedAt),
  });
}

export function hasAnalyticsFingerprintKey(
  fingerprintKeyValue: string | undefined = ANALYTICS_FINGERPRINT_KEY,
): boolean {
  return fingerprintKeySchema.parse(fingerprintKeyValue) !== null;
}

export function reportAnalyticsFailure(operation: string): void {
  console.error(`AI enrichment analytics operation failed: ${operation}`);
}
