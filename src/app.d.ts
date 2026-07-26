import type { AuthSession } from "#lib/server/auth.js";

declare global {
  namespace App {
    interface Locals {
      session: AuthSession["session"] | null;
      user: AuthSession["user"] | null;
    }
  }
}

export {};
