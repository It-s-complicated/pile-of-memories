import { command, getRequestEvent, query, requested } from "$app/server";
import { error } from "@sveltejs/kit";
import {
  createCardRequestSchema,
  deleteCardCommandSchema,
  updateCardCommandSchema,
  updateCardPositionsCommandSchema,
} from "#lib/card.js";
import {
  insertCard as insertCardInDatabase,
  listCards,
  recordEnrichmentReview,
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

export const getLiveCards = query.live(async function* () {
  requirePrivateBoard();
  const signal = getRequestEvent().request.signal;

  try {
    yield* streamCardSnapshots(listCards, signal);
  } catch {
    if (!signal.aborted) databaseUnavailable();
  }
});

export const createCard = command(createCardRequestSchema, async (input) => {
  requirePrivateBoard();

  let card;
  try {
    card = await insertCardInDatabase(input.card);
  } catch {
    databaseUnavailable();
  }

  if (input.creation) {
    try {
      const job = buildReviewAnalyticsJob(card, input.creation);
      void recordEnrichmentReview(job).catch(() => reportAnalyticsFailure("record_review"));
    } catch {
      reportAnalyticsFailure("build_review");
    }
  }

  await requested(getLiveCards, 1).reconnectAll();
  return card;
});

export const updateCard = command(updateCardCommandSchema, async ({ id, changes }) => {
  requirePrivateBoard();

  let card;
  try {
    card = await updateCardInDatabase(id, changes);
  } catch {
    databaseUnavailable();
  }

  if (!card) error(404, "Card not found");
  return card;
});

export const updateCardPositions = command(
  updateCardPositionsCommandSchema,
  async ({ positions }) => {
    requirePrivateBoard();

    let cards;
    try {
      cards = await updateCardPositionsInDatabase(positions);
    } catch {
      databaseUnavailable();
    }

    if (!cards) error(404, "Card not found");
    return cards;
  },
);

export const deleteCard = command(deleteCardCommandSchema, async ({ id }) => {
  requirePrivateBoard();

  let removed;
  try {
    removed = await removeCardFromDatabase(id);
  } catch {
    databaseUnavailable();
  }

  if (!removed) error(404, "Card not found");
});
