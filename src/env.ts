import { defineEnvVars } from "@sveltejs/kit/env";
import * as z from "zod";

export const variables = defineEnvVars({
  APP_URL: { schema: z.url() },
  APPROVED_ATPROTO_DID: { schema: z.string().regex(/^did:/).or(z.literal("")) },
  AUTH_SECRET: { schema: z.string().min(32) },
  OPENCODE_GO_API_KEY: { schema: z.string() },
});
