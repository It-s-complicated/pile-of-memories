import { getRequestEvent } from "$app/server";
import { error } from "@sveltejs/kit";

export function requirePrivateBoard(): void {
  if (!getRequestEvent().locals.did) error(401, "Sign in with your AT Protocol account");
}
