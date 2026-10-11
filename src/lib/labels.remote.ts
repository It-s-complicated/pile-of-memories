import { command, form, getRequestEvent, query } from "$app/server";
import { error, invalid } from "@sveltejs/kit";
import * as z from "zod";
import { deleteLabelSchema, saveLabelSchema } from "#lib/labels.js";
import {
  createLabel as createLabelInDatabase,
  updateLabel as updateLabelInDatabase,
  deleteLabel as deleteLabelInDatabase,
  listLabels,
} from "#lib/server/database.js";
import { streamCardSnapshots } from "#lib/server/card-changes.js";
import { requirePrivateBoard } from "#lib/server/private-board.js";

const databaseErrorSchema = z.object({ code: z.string() }).loose();
function databaseFailure(): never {
  error(503, "Could not save tags and topics. Please try again.");
}

export const getLiveLabels = query.live(async function* () {
  requirePrivateBoard();
  const signal = getRequestEvent().request.signal;
  try {
    yield* streamCardSnapshots(listLabels, signal);
  } catch {
    if (!signal.aborted) error(503, "Could not load tags and topics. Please reconnect.");
  }
});

export const saveLabel = form(saveLabelSchema, async ({ id, ...label }, issue) => {
  requirePrivateBoard();
  let saved;
  try {
    saved = id ? await updateLabelInDatabase(id, label) : await createLabelInDatabase(label);
  } catch (caught) {
    if (databaseErrorSchema.safeParse(caught).data?.code === "23505") {
      invalid(issue.name("A tag or topic with that name already exists. Choose a different name."));
    }
    databaseFailure();
  }
  if (!saved) invalid("This tag or topic was deleted. Copy your changes into a new label.");
  return saved;
});

export const deleteLabel = command(deleteLabelSchema, async ({ id }) => {
  requirePrivateBoard();
  let removed;
  try {
    removed = await deleteLabelInDatabase(id);
  } catch {
    databaseFailure();
  }
  if (!removed) error(404, "This tag or topic no longer exists.");
});
