import { env } from "$env/dynamic/private";
import { chat } from "@tanstack/ai";
import { openaiCompatible } from "@tanstack/ai-openai/compatible";
import {
  enrichmentOutputSchema,
  type EnrichmentInput,
  type EnrichmentOutput,
} from "$lib/enrichment";

export async function enrichMemory(input: EnrichmentInput): Promise<EnrichmentOutput> {
  if (!env.OPENCODE_GO_API_KEY) throw new Error("OPENCODE_GO_API_KEY is not set");

  const opencode = openaiCompatible({
    name: "opencode-go",
    baseURL: "https://opencode.ai/zen/go/v1",
    apiKey: env.OPENCODE_GO_API_KEY,
    models: ["deepseek-v4-flash"],
  });

  const result = await chat({
    adapter: opencode("deepseek-v4-flash"),
    stream: false,
    modelOptions: { response_format: { type: "json_object" } },
    systemPrompts: [
      'Return only a JSON object with the keys "title" and "tags". Create a concise title and 1-5 useful labels for a private memory. Reuse the provided board vocabulary when meaningful. Introduce a short new label only when necessary.',
    ],
    messages: [
      {
        role: "user",
        content: `Board vocabulary: ${JSON.stringify(input.existingTags)}\n\nMemory:\n${input.description}`,
      },
    ],
  });

  return enrichmentOutputSchema.parse(JSON.parse(result));
}
