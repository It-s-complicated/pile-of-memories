import { getRequestEvent } from "$app/server";
import { error } from "@sveltejs/kit";

export function requirePrivateBoard(): void {
  if (!getRequestEvent().locals.user) error(401, "Sign in with the approved GitHub account");
}
