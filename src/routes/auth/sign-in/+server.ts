import { redirect } from "@sveltejs/kit";
import { getOAuth } from "#lib/server/auth.js";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = async (event) => {
  const form = await event.request.formData();
  const handle =
    typeof form.get("handle") === "string" ? (form.get("handle") as string).trim() : "";
  if (!handle) redirect(303, "/?auth_error=handle");
  let destination = "/?auth_error=sign-in";
  try {
    destination = (await (await getOAuth()).authorize(handle)).toString();
  } catch {
    // Unknown handle, resolution failure, or misconfigured APP_URL.
  }
  redirect(303, destination, { external: true });
};
