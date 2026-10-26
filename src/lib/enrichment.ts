import * as z from "zod";
import { cardIdSchema, cardKindSchema } from "./card";
import { canonicalizeLabels, labelSchema } from "./labels";
import { explorationOriginSchema } from "./exploration-analytics";

export const enrichmentInputSchema = z
  .object({
    description: z.string().trim().min(1).max(8_000),
    title: z.string().trim().min(1).max(80).optional(),
    kind: cardKindSchema.optional(),
    sourceIds: z.array(cardIdSchema).max(8).optional(),
    exploration: explorationOriginSchema.optional(),
  })
  .strict();

export const enrichmentOutputSchema = z
  .object({
    kind: cardKindSchema,
    title: z.string().trim().min(1).max(80),
    tags: z.array(labelSchema).max(5).transform(canonicalizeLabels),
    topics: z.array(labelSchema).max(5).transform(canonicalizeLabels),
  })
  .strict()
  .refine(({ tags, topics }) => tags.length + topics.length <= 5, {
    message: "Too many suggested labels",
  });

export const enrichmentResponseSchema = enrichmentOutputSchema.safeExtend({
  attemptId: z.uuidv4(),
});

export type EnrichmentInput = z.infer<typeof enrichmentInputSchema>;
export type EnrichmentOutput = z.infer<typeof enrichmentOutputSchema>;
export type EnrichmentResponse = z.infer<typeof enrichmentResponseSchema>;

export function memorySourceIds(description: string): string[] {
  return [
    ...new Set(
      Array.from(description.matchAll(/\]\(\?memory=([^\s)]+)\)/g)).flatMap((match) => {
        const parsed = cardIdSchema.safeParse(match[1]);
        return parsed.success ? [parsed.data] : [];
      }),
    ),
  ].slice(0, 8);
}

export function fallbackTitle(description: string): string {
  return (
    description
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean)
      ?.slice(0, 80) || "Untitled memory"
  );
}
