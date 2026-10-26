import { command } from "$app/server";
import { explorationEventSchema } from "#lib/exploration-analytics.js";
import { recordExplorationEvent } from "#lib/server/database.js";
import { requirePrivateBoard } from "#lib/server/private-board.js";
import { reportAnalyticsFailure } from "#lib/server/enrichment-analytics.js";

// Actual saves are recorded only by the card creation handler, after persistence succeeds.
const clientEventSchema = explorationEventSchema.refine((event) => event.event !== "idea_saved");
export const trackExplorationEvent = command(clientEventSchema, async (event) => {
  requirePrivateBoard();
  await recordExplorationEvent(event).catch(() => reportAnalyticsFailure("exploration_event"));
});
