import { defineEnvVars } from "@sveltejs/kit/env";
import { z } from "zod";

export const variables = defineEnvVars({
  ANALYTICS_FINGERPRINT_KEY: { schema: z.string() },
  DATABASE_CONNECTION_STRING: { schema: z.string() },
  DATABASE_LISTEN_CONNECTION_STRING: { schema: z.string().optional() },
  OPENCODE_GO_API_KEY: { schema: z.string() },
});
