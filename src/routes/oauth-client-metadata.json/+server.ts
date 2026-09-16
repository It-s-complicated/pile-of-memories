import { json } from "@sveltejs/kit";
import { getOAuth } from "#lib/server/auth.js";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async () => {
  return json((await getOAuth()).metadata);
};
