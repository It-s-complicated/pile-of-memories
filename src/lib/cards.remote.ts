import { command, form, getRequestEvent, query } from "$app/server";
import * as z from "zod";
import { error } from "@sveltejs/kit";
import {
  createCardFormSchema,
  updateCardFormSchema,
  type CardChanges,
  deleteCardCommandSchema,
  updateCardCommandSchema,
  updateCardPositionsCommandSchema,
} from "#lib/card.js";
import {
  insertCard as insertCardInDatabase,
  listCards,
  recordEnrichmentReview,
  recordExplorationEvent,
  removeCard as removeCardFromDatabase,
  updateCard as updateCardInDatabase,
  updateCardPositions as updateCardPositionsInDatabase,
} from "#lib/server/database.js";
import { streamCardSnapshots } from "#lib/server/card-changes.js";
import {
  buildReviewAnalyticsJob,
  reportAnalyticsFailure,
} from "#lib/server/enrichment-analytics.js";
import { requirePrivateBoard } from "#lib/server/private-board.js";

function databaseUnavailable(): never {
  error(503, "Database unavailable");
}

const databaseErrorSchema = z.object({ code: z.string() }).loose();
function databaseFailure(caught: unknown): never {
  if (databaseErrorSchema.safeParse(caught).data?.code === "23503") {
    error(
      409,
      "A selected tag or topic was renamed or deleted. Remove the old selection and choose its current name. Your text has been kept.",
    );
  }
  databaseUnavailable();
}

export const getLiveCards = query.live(async function* () {
  requirePrivateBoard();
  const signal = getRequestEvent().request.signal;

  try {
    yield* streamCardSnapshots(listCards, signal);
  } catch {
    if (!signal.aborted) databaseUnavailable();
  }
});

export const createCard = form(createCardFormSchema, async (input) => {
  requirePrivateBoard();

  const card = await insertCardInDatabase(input.card).catch(databaseFailure);

  if (input.exploration) {
    await recordExplorationEvent({
      sessionId: input.exploration.sessionId,
      runId: input.exploration.runId,
      ideaIndex: input.exploration.ideaIndex,
      selectedCardCount: input.exploration.sourceCardCount,
      event: "idea_saved",
      cardId: card.id,
    }).catch(() => reportAnalyticsFailure("exploration_idea_saved"));
  }

  if (input.creation) {
    try {
      const job = buildReviewAnalyticsJob(card, input.creation);
      void recordEnrichmentReview(job).catch(() => reportAnalyticsFailure("record_review"));
    } catch {
      reportAnalyticsFailure("build_review");
    }
  }

  return card;
});

async function persistCardChanges(id: string, changes: CardChanges) {
  const card = await updateCardInDatabase(id, changes).catch(databaseFailure);
  if (!card) error(404, "Card not found");
  return card;
}

export const saveCard = form(updateCardFormSchema, async ({ id, changes }) => {
  requirePrivateBoard();
  return persistCardChanges(id, changes);
});

export const updateCard = command(updateCardCommandSchema, async ({ id, changes }) => {
  requirePrivateBoard();
  return persistCardChanges(id, changes);
});

export const updateCardPositions = command(
  updateCardPositionsCommandSchema,
  async ({ positions }) => {
    requirePrivateBoard();

    const cards = await updateCardPositionsInDatabase(positions).catch(databaseUnavailable);

    if (!cards) error(404, "Card not found");
    return cards;
  },
);

export const deleteCard = command(deleteCardCommandSchema, async ({ id }) => {
  requirePrivateBoard();

  const removed = await removeCardFromDatabase(id).catch(databaseUnavailable);

  if (!removed) error(404, "Card not found");
});
