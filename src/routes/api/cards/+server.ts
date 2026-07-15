import { dev } from "$app/environment";
import { error, json } from "@sveltejs/kit";
import { parseCardInput } from "$lib/card";
import { insertCard, listCards } from "$lib/server/database";
import type { RequestHandler } from "./$types";

function requirePrivateBoard(): void {
  if (!dev) error(503, "Authentication is required before production use");
}

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
