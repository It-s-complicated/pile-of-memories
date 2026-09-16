import { redirect } from "@sveltejs/kit";
import { SESSION_COOKIE, destroySession } from "#lib/server/auth.js";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = async (event) => {
  const did = event.locals.did;
  if (did) await destroySession(did, event.cookies, event.url);
  event.cookies.delete(SESSION_COOKIE, { path: "/" });
  event.cookies.delete("pom_oauth_state", { path: "/auth" });
  redirect(303, "/");
};
