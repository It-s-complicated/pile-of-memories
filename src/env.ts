import { defineEnvVars } from "@sveltejs/kit/env";
import { z } from "zod";

export const variables = defineEnvVars({
  ANALYTICS_FINGERPRINT_KEY: { schema: z.string() },
  APPROVED_GITHUB_PROVIDER_ID: { schema: z.string().regex(/^\d+$/) },
  BETTER_AUTH_SECRET: { schema: z.string().min(32) },
  BETTER_AUTH_URL: { schema: z.url() },
  DATABASE_CONNECTION_STRING: { schema: z.string() },
  DATABASE_LISTEN_CONNECTION_STRING: { schema: z.string().optional() },
  GITHUB_CLIENT_ID: { schema: z.string() },
  GITHUB_CLIENT_SECRET: { schema: z.string() },
  OPENCODE_GO_API_KEY: { schema: z.string() },
});
