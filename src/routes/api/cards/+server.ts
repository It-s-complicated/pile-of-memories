import { error, json } from "@sveltejs/kit";
import { parseCardInput } from "$lib/card";
import { insertCard, listCards } from "$lib/server/database";
import { requirePrivateBoard } from "$lib/server/private-board";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async () => {
  requirePrivateBoard();
  return json(await listCards());
};

export const POST: RequestHandler = async ({ request }) => {
  requirePrivateBoard();
  const card = parseCardInput(await request.json().catch(() => null));
  if (!card) error(400, "Invalid card");

  return json(await insertCard(card), { status: 201 });
};
