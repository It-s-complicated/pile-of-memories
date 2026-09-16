import { redirect } from "@sveltejs/kit";
import { SESSION_COOKIE, destroySession, verifySessionCookie } from "#lib/server/auth.js";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = async (event) => {
  const did = verifySessionCookie(event.cookies.get(SESSION_COOKIE));
  if (did) await destroySession(did);
  event.cookies.delete(SESSION_COOKIE, { path: "/" });
  redirect(303, "/");
};
