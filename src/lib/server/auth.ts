import { APPROVED_ATPROTO_DID, AUTH_SECRET } from "$app/env/private";
import type { Cookies } from "@sveltejs/kit";
import { createHmac, timingSafeEqual } from "node:crypto";
import { createOAuth, type NodeSavedSession, type OAuth } from "airspace/oauth";

// ponytail: in-memory DPoP-bound OAuth sessions keyed by DID; a server restart
// signs everyone out. Use a durable store when multi-user uptime matters.
const sessions = new Map<string, NodeSavedSession>();

const sessionStore = {
  async get(did: string) {
    return sessions.get(did);
  },
  async set(did: string, session: NodeSavedSession) {
    sessions.set(did, session);
  },
  async del(did: string) {
    sessions.delete(did);
  },
};

let oauthPromise: Promise<OAuth> | undefined;
export function getOAuth(url: URL): Promise<OAuth> {
  return (oauthPromise ??= createOAuth({
    baseUrl: url.origin,
    redirectPath: "/auth/callback",
    name: "Pile of Memories",
    // Identity only; board cards live in the browser's private Airspace space.
    // Server-side space writes would need scopesFor({ spaces: { workspace } })
    // and published lexicons.
    scopes: ["atproto"],
    stores: { session: sessionStore },
  }));
}

export const SESSION_COOKIE = "pom_session";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

function signature(did: string): string {
  return createHmac("sha256", AUTH_SECRET).update(did).digest("base64url");
}

export function setSessionCookie(cookies: Cookies, did: string, url: URL): void {
  cookies.set(SESSION_COOKIE, `${did}|${signature(did)}`, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: url.protocol === "https:",
    maxAge: COOKIE_MAX_AGE,
  });
}

export function verifySessionCookie(value: string | undefined): string | null {
  if (!value || !APPROVED_ATPROTO_DID) return null;
  const separator = value.lastIndexOf("|");
  if (separator < 0) return null;
  const did = value.slice(0, separator);
  const given = value.slice(separator + 1);
  const expected = signature(did);
  if (
    given.length !== expected.length ||
    !timingSafeEqual(Buffer.from(given), Buffer.from(expected))
  ) {
    return null;
  }
  return did === APPROVED_ATPROTO_DID ? did : null;
}

export async function destroySession(did: string, url: URL): Promise<void> {
  sessions.delete(did);
  await (await getOAuth(url)).revoke(did);
}
