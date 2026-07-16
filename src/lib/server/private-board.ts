import { dev } from "$app/environment";
import { error } from "@sveltejs/kit";

export function requirePrivateBoard(): void {
  if (!dev) error(503, "Authentication is required before production use");
}
