import * as z from "zod";
import { enrichmentErrorCodeSchema, enrichmentUsageSchema } from "./enrichment-analytics";

export const explorationOriginSchema = z
  .object({
    sessionId: z.uuidv4(),
    runId: z.uuidv4(),
    ideaIndex: z.number().int().min(0).max(2),
    sourceCardCount: z.number().int().min(1).max(8),
  })
  .strict();
export type ExplorationOrigin = z.infer<typeof explorationOriginSchema>;
export const explorationEventSchema = z
  .object({
    sessionId: z.uuidv4(),
    event: z.enum([
      "opened",
      "closed",
      "card_added",
      "card_removed",
      "draft_selected",
      "draft_cancelled",
      "idea_saved",
    ]),
    runId: z.uuidv4().optional(),
    selectedCardCount: z.number().int().min(0).max(8).optional(),
    selectionSource: z.enum(["suggested", "manual"]).optional(),
    ideaIndex: z.number().int().min(0).max(2).optional(),
  })
  .strict();
export type ExplorationEvent = z.infer<typeof explorationEventSchema>;

export const explorationRunSchema = z.object({
  id: z.uuidv4(),
  sessionId: z.uuidv4(),
  operation: z.enum(["related", "reflection"]),
  provider: z.string(),
  model: z.string(),
  selectedCardCount: z.number().int().min(1).max(8),
  questionCharacterCount: z.number().int().min(0).max(1_000),
});
export type ExplorationRun = z.infer<typeof explorationRunSchema>;
export const explorationMetricsSchema = z.object({
  candidateCount: z.number().int().nonnegative().optional(),
  suggestionCount: z.number().int().nonnegative().optional(),
  observationCount: z.number().int().nonnegative().optional(),
  ideaCount: z.number().int().nonnegative().optional(),
});
export type ExplorationMetrics = z.infer<typeof explorationMetricsSchema>;
export const completedExplorationRunSchema = explorationRunSchema.extend({
  status: z.enum(["succeeded", "failed"]),
  latencyMs: z.number().int().nonnegative(),
  usage: enrichmentUsageSchema,
  errorCode: enrichmentErrorCodeSchema.nullable(),
  metrics: explorationMetricsSchema,
});
export type CompletedExplorationRun = z.infer<typeof completedExplorationRunSchema>;
