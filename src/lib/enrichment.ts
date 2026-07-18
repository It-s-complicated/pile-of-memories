import { z } from "zod";
import { canonicalizeLabels, labelSchema } from "./labels";

export const enrichmentInputSchema = z
  .object({
    description: z.string().trim().min(1).max(8_000),
    existingTags: z.array(labelSchema).max(1_000).transform(canonicalizeLabels),
  })
  .strict()
  .refine(({ existingTags }) => existingTags.length <= 200, {
    message: "Too many existing tags",
    path: ["existingTags"],
  });

export const enrichmentOutputSchema = z
  .object({
    title: z.string().trim().min(1).max(80),
    tags: z.array(labelSchema).min(1).max(5).transform(canonicalizeLabels),
  })
  .strict();

export const enrichmentResponseSchema = enrichmentOutputSchema.safeExtend({
  attemptId: z.string().uuid(),
});

export type EnrichmentInput = z.infer<typeof enrichmentInputSchema>;
export type EnrichmentOutput = z.infer<typeof enrichmentOutputSchema>;
export type EnrichmentResponse = z.infer<typeof enrichmentResponseSchema>;

export function fallbackTitle(description: string): string {
  return (
    description
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean)
      ?.slice(0, 80) || "Untitled memory"
  );
}
