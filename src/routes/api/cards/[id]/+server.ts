import { error, json } from "@sveltejs/kit";
import { isCardId, parseCardChanges } from "$lib/card";
import { removeCard, updateCard } from "$lib/server/database";
import { requirePrivateBoard } from "$lib/server/private-board";
import type { RequestHandler } from "./$types";

export const PATCH: RequestHandler = async ({ params, request }) => {
  requirePrivateBoard();
  if (!isCardId(params.id)) error(400, "Invalid card ID");
  const changes = parseCardChanges(await request.json().catch(() => null));
  if (!changes) error(400, "Invalid card changes");

  const card = await updateCard(params.id, changes);
  if (!card) error(404, "Card not found");
  return json(card);
};

export const DELETE: RequestHandler = async ({ params }) => {
  requirePrivateBoard();
  if (!isCardId(params.id)) error(400, "Invalid card ID");
  if (!(await removeCard(params.id))) error(404, "Card not found");
  return new Response(null, { status: 204 });
};
