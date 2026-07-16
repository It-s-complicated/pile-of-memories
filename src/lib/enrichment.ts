import { z } from "zod";
import { canonicalizeLabels, MAX_LABEL_LENGTH } from "./labels";

const labelSchema = z.string().trim().min(1).max(MAX_LABEL_LENGTH);

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

export type EnrichmentInput = z.infer<typeof enrichmentInputSchema>;
export type EnrichmentOutput = z.infer<typeof enrichmentOutputSchema>;

export function fallbackTitle(description: string): string {
  return (
    description
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean)
      ?.slice(0, 80) || "Untitled memory"
  );
}

export async function requestEnrichment(input: EnrichmentInput): Promise<EnrichmentOutput> {
  const response = await fetch("/api/memories/enrich", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
    signal: AbortSignal.timeout(60_000),
  });

  if (!response.ok) throw new Error("AI enrichment is unavailable");
  return enrichmentOutputSchema.parse(await response.json());
}
