import * as z from "zod";
import { canonicalizeLabels } from "./labels";

export const ENRICHMENT_ERROR_CODES = [
  "configuration_missing",
  "provider_timeout",
  "provider_rejected",
  "invalid_provider_json",
  "invalid_provider_output",
  "unknown",
] as const;

export const enrichmentErrorCodeSchema = z.enum(ENRICHMENT_ERROR_CODES);
export const enrichmentResultSourceSchema = z.enum(["ai", "cache", "fallback"]);

export type EnrichmentErrorCode = z.infer<typeof enrichmentErrorCodeSchema>;
export type EnrichmentResultSource = z.infer<typeof enrichmentResultSourceSchema>;

export const cardCreationProvenanceSchema = z
  .object({
    enrichmentAttemptId: z.string().uuid().nullable(),
    resultSource: enrichmentResultSourceSchema,
    reviewStartedAt: z.iso.datetime({ offset: true }).optional(),
  })
  .strict();

export type CardCreationProvenance = z.infer<typeof cardCreationProvenanceSchema>;

export const enrichmentUsageSchema = z
  .object({
    promptTokens: z.number().int().nonnegative().nullable(),
    completionTokens: z.number().int().nonnegative().nullable(),
    totalTokens: z.number().int().nonnegative().nullable(),
    providerCost: z.number().finite().nonnegative().nullable(),
  })
  .strict();

export type EnrichmentUsage = z.infer<typeof enrichmentUsageSchema>;

export type EnrichmentAttemptStarted = {
  id: string;
  provider: string;
  model: string;
  promptVersion: string;
  inputCharacterCount: number;
  existingTagCount: number;
};

export type EnrichmentAttemptCompleted = EnrichmentAttemptStarted & {
  latencyMs: number;
  usage: EnrichmentUsage;
};

export type EnrichmentAttemptSucceeded = EnrichmentAttemptCompleted & {
  generatedTitleFingerprint: string | null;
  generatedTagFingerprints: string[] | null;
  generatedTagCount: number;
  vocabularyReuseCount: number;
};

export type EnrichmentAttemptFailed = EnrichmentAttemptCompleted & {
  errorCode: EnrichmentErrorCode;
};

export type EnrichmentReviewJob = Readonly<{
  id: string;
  attemptId: string | null;
  cardId: string;
  resultSource: EnrichmentResultSource;
  finalTitleFingerprint: string | null;
  finalTagFingerprints: readonly string[] | null;
  finalTagCount: number;
  reviewDurationMs: number | null;
}>;

export type TagReviewMetrics = {
  generatedTagCount: number;
  finalTagCount: number;
  retainedTagCount: number;
  removedTagCount: number;
  addedTagCount: number;
  generatedTagAcceptance: number | null;
  finalTagCoverage: number | null;
};

export function normalizeAnalyticsTags(labels: string[]): string[] {
  return canonicalizeLabels(labels).map((label) => label.toLowerCase());
}

export function ratioOrNull(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : numerator / denominator;
}

export function compareTagFingerprints(
  generatedFingerprints: readonly string[],
  finalFingerprints: readonly string[],
): TagReviewMetrics {
  const generated = new Set(generatedFingerprints);
  const final = new Set(finalFingerprints);
  let retainedTagCount = 0;

  for (const fingerprint of generated) {
    if (final.has(fingerprint)) retainedTagCount += 1;
  }

  return {
    generatedTagCount: generated.size,
    finalTagCount: final.size,
    retainedTagCount,
    removedTagCount: generated.size - retainedTagCount,
    addedTagCount: final.size - retainedTagCount,
    generatedTagAcceptance: ratioOrNull(retainedTagCount, generated.size),
    finalTagCoverage: ratioOrNull(retainedTagCount, final.size),
  };
}
