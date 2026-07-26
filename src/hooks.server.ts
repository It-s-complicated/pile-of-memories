import { building } from "$app/env";
import type { Handle } from "@sveltejs/kit";
import { svelteKitHandler } from "better-auth/svelte-kit";
import { auth, isApprovedUser } from "#lib/server/auth.js";

export const handle: Handle = async ({ event, resolve }) => {
  event.locals.session = null;
  event.locals.user = null;

  if (!building) {
    const session = await auth.api.getSession({ headers: event.request.headers });
    if (session && (await isApprovedUser(session.user.id))) {
      event.locals.session = session.session;
      event.locals.user = session.user;
    }
  }

  return svelteKitHandler({ event, resolve, auth, building });
};
