import { defineEnvVars } from "@sveltejs/kit/env";
import * as z from "zod";

export const variables = defineEnvVars({
  ANALYTICS_FINGERPRINT_KEY: { schema: z.string().trim().min(32) },
  APPROVED_GITHUB_PROVIDER_ID: { schema: z.string().regex(/^\d+$/) },
  BETTER_AUTH_SECRET: { schema: z.string().trim().min(32) },
  BETTER_AUTH_URL: { schema: z.url() },
  DATABASE_CONNECTION_STRING: { schema: z.string().trim().min(1) },
  DATABASE_LISTEN_CONNECTION_STRING: { schema: z.string().trim().min(1) },
  GITHUB_CLIENT_ID: { schema: z.string().trim().min(1) },
  GITHUB_CLIENT_SECRET: { schema: z.string().trim().min(1) },
  OPENCODE_GO_API_KEY: { schema: z.string().trim().min(1) },
  TYPESAFE_API_KEY: { schema: z.string().trim().min(1) },
});
