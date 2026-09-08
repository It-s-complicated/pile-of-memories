import type { AuthSession } from "#lib/server/auth.js";

declare global {
  namespace App {
    interface PageState {
      captureHistory?: boolean;
    }
    interface Locals {
      session: AuthSession["session"] | null;
      user: AuthSession["user"] | null;
    }
  }
}

export {};
