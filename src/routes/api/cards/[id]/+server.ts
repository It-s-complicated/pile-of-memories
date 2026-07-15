import { dev } from "$app/environment";
import { error, json } from "@sveltejs/kit";
import { isCardId, parseCardChanges } from "$lib/card";
import { removeCard, updateCard } from "$lib/server/database";
import type { RequestHandler } from "./$types";

function requirePrivateBoard(): void {
  if (!dev) error(503, "Authentication is required before production use");
}

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
