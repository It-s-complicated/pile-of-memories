import { DATABASE_CONNECTION_STRING } from "$app/env/private";
import type { Handle } from "@sveltejs/kit/hooks";
import { setupServer, type SetupServer } from "msw/node";
import { approveGitHubSignIn, githubHandlers } from "./github.js";
import { opencodeHandlers } from "./opencode.js";
import { typesafeHandlers } from "./typesafe.js";

export const handlers = [...githubHandlers, ...opencodeHandlers, ...typesafeHandlers];

// Survives dev-server module reloads, so an edited mock replaces the running one.
const running = globalThis as { mockedServices?: SetupServer };

/**
 * Mock mode's single entry point: answers every external HTTP request the server makes with the
 * handlers above, fails any other outbound request, and wraps `handle` to approve GitHub sign-ins.
 */
export function withMockedServices(handle: Handle): Handle {
  // A mock sign-in is always approved, so it must never reach a real board's database.
  if (!new URL(DATABASE_CONNECTION_STRING).pathname.endsWith("_mock")) {
    throw new Error(
      "Mock mode only runs against a database whose name ends in _mock. " +
        "Check that nothing in your shell or .env.mock.local overrides .env.mock.",
    );
  }

  running.mockedServices?.close();
  running.mockedServices = setupServer(...handlers);
  running.mockedServices.listen({ onUnhandledFrame: "error" });

  return async (input) => {
    const response = await handle(input);
    return input.event.url.pathname === "/api/auth/sign-in/social"
      ? approveGitHubSignIn(response)
      : response;
  };
}
