import { command, query } from "$app/server";
import { error } from "@sveltejs/kit";
import {
  createCardRequestSchema,
  deleteCardCommandSchema,
  updateCardCommandSchema,
} from "$lib/card";
import {
  insertCard as insertCardInDatabase,
  listCards,
  recordEnrichmentReview,
  removeCard as removeCardFromDatabase,
  updateCard as updateCardInDatabase,
} from "$lib/server/database";
import { buildReviewAnalyticsJob, reportAnalyticsFailure } from "$lib/server/enrichment-analytics";
import { requirePrivateBoard } from "$lib/server/private-board";

function databaseUnavailable(): never {
  error(503, "Database unavailable");
}

export const getCards = query(async () => {
  requirePrivateBoard();
  try {
    return await listCards();
  } catch {
    databaseUnavailable();
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
