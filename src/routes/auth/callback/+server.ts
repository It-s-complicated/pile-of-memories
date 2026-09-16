import { APPROVED_ATPROTO_DID } from "$app/env/private";
import { redirect } from "@sveltejs/kit";
import { destroySession, getOAuth, setSessionCookie } from "#lib/server/auth.js";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async (event) => {
  let did: string | null = null;
  try {
    did = (await (await getOAuth(event.url)).callback(event.url.searchParams)).did;
  } catch {
    // Bad state, expired request, or rejected code.
  }
  if (!did) redirect(303, "/?auth_error=callback");
  if (did !== APPROVED_ATPROTO_DID) {
    await destroySession(did, event.url);
    redirect(303, "/?auth_error=denied");
  }
  setSessionCookie(event.cookies, did, event.url);
  redirect(303, "/");
};
