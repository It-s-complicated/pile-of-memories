import { json } from "@sveltejs/kit";
import { getOAuth } from "#lib/server/auth.js";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ cookies, url }) => {
  return json((await getOAuth(cookies, url)).metadata);
};
