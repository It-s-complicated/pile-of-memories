import { building } from "$app/env";
import type { Handle } from "@sveltejs/kit/hooks";
import { svelteKitHandler } from "better-auth/svelte-kit";
import { auth, isApprovedUser } from "#lib/server/auth.js";

const boardHandle: Handle = async ({ event, resolve }) => {
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

// `vp run dev:mock` answers GitHub, OpenCode and TypeSafe locally. The app is otherwise unaware
// of it: everything mock-related lives in src/mocks and is left out of production builds.
export const handle: Handle =
  import.meta.env.MODE === "mock"
    ? (await import("./mocks/server.js")).withMockedServices(boardHandle)
    : boardHandle;
