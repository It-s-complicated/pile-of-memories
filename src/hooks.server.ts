import { building } from "$app/env";
import type { Handle } from "@sveltejs/kit/hooks";
import { SESSION_COOKIE, verifySessionCookie } from "#lib/server/auth.js";

export const handle: Handle = async ({ event, resolve }) => {
  event.locals.did = building ? null : verifySessionCookie(event.cookies.get(SESSION_COOKIE));
  return resolve(event);
};
