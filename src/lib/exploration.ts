import * as z from "zod";
import { cardIdSchema, type Card } from "./card";
import type { ExplorationOrigin } from "./exploration-analytics";

export const MAX_EXPLORATION_CARDS = 8;
export const relationshipLabels = {
  shared_theme: "Shared theme",
  another_angle: "Another angle",
  counterpoint: "Counterpoint",
};
const questionSchema = z.string().trim().max(1_000).default("");
const sessionIdSchema = z.uuidv4().default(() => crypto.randomUUID());
export const explorationInputSchema = z
  .object({ seedId: cardIdSchema, question: questionSchema, sessionId: sessionIdSchema })
  .strict();
export const reflectionInputSchema = z
  .object({
    cardIds: z
      .array(cardIdSchema)
      .min(1)
      .max(MAX_EXPLORATION_CARDS)
      .refine((ids) => new Set(ids).size === ids.length, "Choose each card once"),
    question: questionSchema,
    sessionId: sessionIdSchema,
  })
  .strict();
export const explorationSuggestionSchema = z
  .object({
    cardId: cardIdSchema,
    relationship: z.enum(["shared_theme", "another_angle", "counterpoint"]),
  })
  .strict();
export type ExplorationSuggestion = z.infer<typeof explorationSuggestionSchema>;
export const explorationSuggestionsSchema = z.object({
  suggestions: z.array(explorationSuggestionSchema).max(6),
  scannedCount: z.number().int().nonnegative(),
  totalCount: z.number().int().nonnegative(),
});
const sourceIdsSchema = z.array(cardIdSchema).min(1).max(MAX_EXPLORATION_CARDS);
export const reflectionSchema = z
  .object({
    observations: z
      .array(
        z
          .object({
            text: z.string().trim().min(1).max(1_500),
            sourceIds: sourceIdsSchema,
          })
          .strict(),
      )
      .min(1)
      .max(5),
    ideas: z
      .array(
        z
          .object({
            title: z.string().trim().min(1).max(80),
            body: z.string().trim().min(1).max(3_000),
            sourceIds: sourceIdsSchema,
          })
          .strict(),
      )
      .min(1)
      .max(3),
    questions: z.array(z.string().trim().min(1).max(500)).max(3),
  })
  .strict();
export type Reflection = z.infer<typeof reflectionSchema>;
export const reflectionResultSchema = reflectionSchema.extend({ runId: z.uuidv4() });
export type ReflectionResult = z.infer<typeof reflectionResultSchema>;
export type IdeaDraft = {
  title: string;
  body: string;
  kind: "idea";
  sourceIds?: string[];
  exploration?: ExplorationOrigin;
};

export function buildIdeaDraft(
  idea: Reflection["ideas"][number],
  cards: Card[],
  question: string,
  exploration?: ExplorationOrigin,
): IdeaDraft {
  const sources = [...new Set(idea.sourceIds)].map((id) => cards.find((card) => card.id === id));
  const links = sources.flatMap((card) =>
    card
      ? [`- [${card.title.replace(/[\\[\]]/g, "\\$&").replace(/\r?\n/g, " ")}](?memory=${card.id})`]
      : [],
  );
  return {
    title: idea.title,
    kind: "idea",
    sourceIds: [...new Set(idea.sourceIds)],
    ...(exploration ? { exploration } : {}),
    body: [
      idea.body,
      question.trim() ? `## Exploration question\n\n${question.trim()}` : "",
      links.length ? `## Inspired by\n\n${links.join("\n")}` : "",
    ]
      .filter(Boolean)
      .join("\n\n"),
  };
}
