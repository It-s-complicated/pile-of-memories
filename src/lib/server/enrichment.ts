import { env } from "$env/dynamic/private";
import { chat } from "@tanstack/ai";
import { openaiCompatible } from "@tanstack/ai-openai/compatible";
import { z } from "zod";
import {
  enrichmentOutputSchema,
  type EnrichmentInput,
  type EnrichmentOutput,
} from "$lib/enrichment";

const providerOutputSchema = z.object({
  title: z.string().min(1).max(80),
  tags: z.array(z.string().min(1).max(40)).min(1).max(5),
});

export async function enrichMemory(input: EnrichmentInput): Promise<EnrichmentOutput> {
  if (!env.OPENCODE_GO_API_KEY) throw new Error("OPENCODE_GO_API_KEY is not set");

  const opencode = openaiCompatible({
    name: "opencode-go",
    baseURL: "https://opencode.ai/zen/go/v1",
    apiKey: env.OPENCODE_GO_API_KEY,
    models: ["glm-5.2"],
  });

  const result = await chat({
    adapter: opencode("glm-5.2"),
    systemPrompts: [
      "Create a concise title and 1-5 useful labels for a private memory. Reuse the provided board vocabulary when meaningful. Introduce a short new label only when necessary.",
    ],
    messages: [
      {
        role: "user",
        content: `Board vocabulary: ${JSON.stringify(input.existingTags)}\n\nMemory:\n${input.description}`,
      },
    ],
    outputSchema: providerOutputSchema,
  });

  return enrichmentOutputSchema.parse(result);
}
