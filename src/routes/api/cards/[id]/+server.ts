import { error, json } from "@sveltejs/kit";
import { cardIdSchema, parseCardChanges } from "$lib/card";
import { removeCard, updateCard } from "$lib/server/database";
import { requirePrivateBoard } from "$lib/server/private-board";
import type { RequestHandler } from "./$types";

export const PATCH: RequestHandler = async ({ params, request }) => {
  requirePrivateBoard();
  const cardId = cardIdSchema.safeParse(params.id);
  if (!cardId.success) error(400, "Invalid card ID");
  const changes = parseCardChanges(await request.json().catch(() => null));
  if (!changes) error(400, "Invalid card changes");

  const card = await updateCard(cardId.data, changes);
  if (!card) error(404, "Card not found");
  return json(card);
};

export const DELETE: RequestHandler = async ({ params }) => {
  requirePrivateBoard();
  const cardId = cardIdSchema.safeParse(params.id);
  if (!cardId.success) error(400, "Invalid card ID");
  if (!(await removeCard(cardId.data))) error(404, "Card not found");
  return new Response(null, { status: 204 });
};
