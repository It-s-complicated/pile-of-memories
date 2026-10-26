import { command, getRequestEvent } from "$app/server";
import { error } from "@sveltejs/kit";
import type { TokenUsage } from "@tanstack/ai";
import {
  explorationInputSchema,
  explorationSuggestionsSchema,
  reflectionInputSchema,
} from "#lib/exploration.js";
import {
  listCards,
  recordExplorationRunStarted,
  recordExplorationRunCompleted,
} from "#lib/server/database.js";
import { requirePrivateBoard } from "#lib/server/private-board.js";
import {
  generateReflection,
  suggestRelatedCards,
  REFLECTION_MODEL,
} from "#lib/server/exploration.js";
import { withDeadline } from "#lib/server/deadline.js";
import { classifyEnrichmentError, reportedUsageSchema } from "#lib/server/enrichment.js";
import { reportAnalyticsFailure } from "#lib/server/enrichment-analytics.js";
import { LABEL_MODEL } from "#lib/server/label-selection.js";
import type { ExplorationRun, ExplorationMetrics } from "#lib/exploration-analytics.js";

async function activeCards() {
  return (await listCards().catch(() => error(503, "Could not load cards. Try again."))).filter(
    (card) => !card.archived,
  );
}

async function runExploration<T extends object>(
  started: ExplorationRun,
  run: (controller: AbortController, onUsage: (usage: TokenUsage) => void) => Promise<T>,
  metrics: (result: T) => ExplorationMetrics,
): Promise<T & { runId: string }> {
  const startedAt = Date.now();
  let usage: TokenUsage | undefined;
  let timedOut = false;
  await recordExplorationRunStarted(started).catch(() =>
    reportAnalyticsFailure("exploration_started"),
  );
  const controller = new AbortController();
  const requestSignal = getRequestEvent().request.signal;
  const abort = () => controller.abort();
  requestSignal.addEventListener("abort", abort, { once: true });
  if (requestSignal.aborted) abort();
  const timeout = setTimeout(() => {
    timedOut = true;
    abort();
  }, 55_000);
  try {
    const result = await withDeadline(
      run(controller, (reported) => {
        usage = reported;
      }),
      60_000,
      () => new Error("Exploration timed out"),
    );
    await recordExplorationRunCompleted({
      ...started,
      status: "succeeded",
      latencyMs: Date.now() - startedAt,
      usage: reportedUsageSchema.parse(usage ?? {}),
      errorCode: null,
      metrics: metrics(result),
    }).catch(() => reportAnalyticsFailure("exploration_succeeded"));
    return { ...result, runId: started.id };
  } catch (caught) {
    await recordExplorationRunCompleted({
      ...started,
      status: "failed",
      latencyMs: Date.now() - startedAt,
      usage: reportedUsageSchema.parse(usage ?? {}),
      errorCode: classifyEnrichmentError(caught, { timedOut }),
      metrics: {},
    }).catch(() => reportAnalyticsFailure("exploration_failed"));
    error(502, "Exploration is unavailable right now. Please try again.");
  } finally {
    clearTimeout(timeout);
    requestSignal.removeEventListener("abort", abort);
    controller.abort();
  }
}

export const suggestExploration = command(
  explorationInputSchema,
  async ({ seedId, question, sessionId }) => {
    requirePrivateBoard();
    const cards = await activeCards();
    const seed = cards.find((card) => card.id === seedId);
    if (!seed) error(404, "This card is no longer on the board.");
    return explorationSuggestionsSchema.parse(
      await runExploration(
        {
          id: crypto.randomUUID(),
          sessionId,
          operation: "related",
          provider: "typesafe",
          model: LABEL_MODEL,
          selectedCardCount: 1,
          questionCharacterCount: question.length,
        },
        (controller, onUsage) =>
          suggestRelatedCards(seed, cards, question, controller.signal, onUsage),
        (result) => ({
          candidateCount: result.scannedCount,
          suggestionCount: result.suggestions.length,
        }),
      ),
    );
  },
);

export const reflectOnCards = command(
  reflectionInputSchema,
  async ({ cardIds, question, sessionId }) => {
    requirePrivateBoard();
    const cards = await activeCards();
    // Resolve content on the server so the model only sees cards from the private board.
    const context = cardIds.map((id) => {
      const card = cards.find((candidate) => candidate.id === id);
      if (!card) error(409, "A selected card was archived or deleted. Choose your cards again.");
      return card;
    });
    return runExploration(
      {
        id: crypto.randomUUID(),
        sessionId,
        operation: "reflection",
        provider: "opencode-zen",
        model: REFLECTION_MODEL,
        selectedCardCount: context.length,
        questionCharacterCount: question.length,
      },
      (controller, onUsage) => generateReflection(context, question, controller, onUsage),
      (result) => ({
        observationCount: result.observations.length,
        ideaCount: result.ideas.length,
      }),
    );
  },
);
