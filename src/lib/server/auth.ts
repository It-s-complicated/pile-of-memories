import {
  APPROVED_GITHUB_PROVIDER_ID,
  BETTER_AUTH_SECRET,
  BETTER_AUTH_URL,
  DATABASE_CONNECTION_STRING,
  GITHUB_CLIENT_ID,
  GITHUB_CLIENT_SECRET,
} from "$app/env/private";
import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { Pool } from "pg";
import { isApprovedGitHubAccount } from "./auth-policy";

const pool = new Pool({
  connectionString: DATABASE_CONNECTION_STRING,
  max: 2,
  ssl: { rejectUnauthorized: false },
});

export const auth = betterAuth({
  appName: "Pile of Memories",
  baseURL: BETTER_AUTH_URL,
  secret: BETTER_AUTH_SECRET,
  database: pool,
  socialProviders: {
    github: {
      clientId: GITHUB_CLIENT_ID,
      clientSecret: GITHUB_CLIENT_SECRET,
    },
  },
  account: {
    encryptOAuthTokens: true,
    accountLinking: { enabled: false },
  },
  databaseHooks: {
    account: {
      create: {
        async before(account) {
          if (
            !isApprovedGitHubAccount(
              account.providerId,
              account.accountId,
              APPROVED_GITHUB_PROVIDER_ID,
            )
          ) {
            throw new APIError("FORBIDDEN", {
              message: "This GitHub account is not approved for this board.",
            });
          }
          return { data: account };
        },
      },
    },
  },
});

export async function isApprovedUser(userId: string): Promise<boolean> {
  if (!APPROVED_GITHUB_PROVIDER_ID) return false;
  const result = await pool.query(
    `SELECT 1 FROM account
     WHERE "userId" = $1 AND "providerId" = 'github' AND "accountId" = $2`,
    [userId, APPROVED_GITHUB_PROVIDER_ID],
  );
  return result.rowCount === 1;
}

export type AuthSession = typeof auth.$Infer.Session;
