import { defineEnvVars } from "@sveltejs/kit/env";
import * as z from "zod";

export const variables = defineEnvVars({
  CONTEXT: { static: true, schema: z.string().default("") },
  DEPLOY_PRIME_URL: {
    static: true,
    schema: z
      .url({ protocol: /^https$/ })
      .refine(
        (value) => value === new URL(value).origin,
        "Expected an HTTPS origin without a trailing slash",
      )
      .optional(),
  },
  AUTH_ORIGIN: {
    schema: z
      .url()
      .refine((value) => {
        const url = new URL(value);
        return (
          value === url.origin &&
          (url.protocol === "https:" || (url.protocol === "http:" && url.hostname === "127.0.0.1"))
        );
      }, "Use an HTTPS origin (or http://127.0.0.1:5173 for development)")
      .default("http://127.0.0.1:5173"),
  },
  APPROVED_ATPROTO_DID: { schema: z.string().regex(/^did:/).or(z.literal("")) },
  AUTH_SECRET: { schema: z.string().min(32) },
  OPENCODE_GO_API_KEY: { schema: z.string() },
});
