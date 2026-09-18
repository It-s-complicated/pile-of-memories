import {
  APPROVED_ATPROTO_DID,
  AUTH_SECRET,
  AUTH_ORIGIN,
  CONTEXT,
  DEPLOY_PRIME_URL,
} from "$app/env/private";
import type { Cookies } from "@sveltejs/kit";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import * as z from "zod";
import {
  createOAuth,
  type NodeSavedSession,
  type NodeSavedState,
  type OAuth,
} from "airspace/oauth";

import { storageScopes } from "../airspace-model";

const COOKIE_MAX_AGE = 60 * 60 * 24 * 30;
export const SESSION_COOKIE = "pom_session";
const MAX_COOKIE_LENGTH = 3800;
const entrySchema = z.object({ key: z.string(), expiresAt: z.number().int(), value: z.unknown() });

function authOrigin(): string {
  if (CONTEXT === "deploy-preview" || CONTEXT === "branch-deploy") {
    if (!DEPLOY_PRIME_URL)
      throw new Error("Netlify previews require DEPLOY_PRIME_URL at build time.");
    return DEPLOY_PRIME_URL;
  }
  return AUTH_ORIGIN;
}

function encryptionKey() {
  return createHash("sha256").update(AUTH_SECRET).update("\0").update(authOrigin()).digest();
}

function readCookie(name: string, value: string | undefined) {
  if (!value || value.length > MAX_COOKIE_LENGTH) return null;
  try {
    const bytes = Buffer.from(value, "base64url");
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), bytes.subarray(0, 12));
    decipher.setAAD(Buffer.from(name));
    decipher.setAuthTag(bytes.subarray(12, 28));
    const plaintext = Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]);
    const entry = entrySchema.parse(JSON.parse(plaintext.toString("utf8")));
    return entry.expiresAt > Date.now() ? entry : null;
  } catch {
    return null;
  }
}

function oauthStore<T>(cookies: Cookies, name: string, maxAge: number, path: string) {
  return {
    async get(key: string): Promise<T | undefined> {
      const entry = readCookie(name, cookies.get(name));
      // The authenticated ciphertext was written by this app; OAuth validates its own data.
      return entry?.key === key ? (entry.value as T) : undefined;
    },
    async set(key: string, value: T) {
      const iv = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
      cipher.setAAD(Buffer.from(name));
      const plaintext = JSON.stringify({ key, value, expiresAt: Date.now() + maxAge * 1000 });
      const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
      const sealed = Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString("base64url");
      // ponytail: one bounded cookie per store; use server storage if OAuth payloads outgrow it.
      if (sealed.length > MAX_COOKIE_LENGTH)
        throw new Error("OAuth data exceeds the cookie size limit.");
      cookies.set(name, sealed, {
        path,
        httpOnly: true,
        sameSite: "lax",
        secure: authOrigin().startsWith("https:"),
        maxAge,
      });
    },
    async del(key: string) {
      if (readCookie(name, cookies.get(name))?.key === key) cookies.delete(name, { path });
    },
  };
}

export function getOAuth(cookies: Cookies, url: URL): Promise<OAuth> {
  const origin = authOrigin();
  if (url.origin !== origin) throw new Error("Use the configured AUTH_ORIGIN to sign in.");
  return createOAuth({
    baseUrl: origin,
    redirectPath: "/auth/callback",
    name: "Pile of Memories",
    scopes: storageScopes,
    stores: {
      session: oauthStore<NodeSavedSession>(cookies, SESSION_COOKIE, COOKIE_MAX_AGE, "/"),
      // ponytail: one pending login per browser; starting another replaces its callback state.
      state: oauthStore<NodeSavedState>(cookies, "pom_oauth_state", 60 * 10, "/auth"),
    },
  });
}

export function verifySessionCookie(value: string | undefined): string | null {
  const entry = readCookie(SESSION_COOKIE, value);
  return entry && APPROVED_ATPROTO_DID && entry.key === APPROVED_ATPROTO_DID ? entry.key : null;
}

export async function destroySession(did: string, cookies: Cookies, url: URL): Promise<void> {
  await (await getOAuth(cookies, url)).revoke(did);
}
