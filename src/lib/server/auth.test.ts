import type { Cookies } from "@sveltejs/kit";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { createOAuth, NodeSavedSession, NodeSavedState } from "airspace/oauth";
import { storageScopes } from "../airspace-model";
import { getOAuth, destroySession, verifySessionCookie, SESSION_COOKIE } from "./auth";

const mocks = vi.hoisted(() => ({
  createOAuth: vi.fn(),
  revoke: vi.fn(),
  context: "",
  deployUrl: undefined as string | undefined,
}));
vi.mock("airspace/oauth", () => ({ createOAuth: mocks.createOAuth }));
vi.mock("$app/env/private", () => ({
  APPROVED_ATPROTO_DID: "did:plc:owner",
  AUTH_SECRET: "test-secret-that-is-at-least-32-characters",
  AUTH_ORIGIN: "https://memories.example",
  get CONTEXT() {
    return mocks.context;
  },
  get DEPLOY_PRIME_URL() {
    return mocks.deployUrl;
  },
}));
type Options = Parameters<typeof createOAuth>[0];
const did = "did:plc:owner";
const origin = new URL("https://memories.example");
// OAuth owns the serialized payload schema; exercise its store contract here.
const session = {
  tokenSet: { sub: did, access_token: "private-token" },
} as unknown as NodeSavedSession;
const state = { verifier: "private-pkce-verifier" } as NodeSavedState;

function browser(initial: Map<string, string> = new Map()) {
  const values = new Map(initial);
  const set = vi.fn((name: string, value: string) => {
    values.set(name, value);
  });
  const cookies = {
    get: (name: string) => values.get(name),
    set,
    delete: (name: string) => {
      values.delete(name);
    },
  } as unknown as Cookies;
  return { cookies, values, set };
}

async function stores(cookies: Cookies) {
  await getOAuth(cookies, origin);
  return (mocks.createOAuth.mock.lastCall![0] as Options).stores;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.context = "";
  mocks.deployUrl = undefined;
  mocks.createOAuth.mockImplementation(async (options: Options) => ({
    revoke: async (key: string) => {
      const stored = await options.stores.session.get(key);
      if (stored) mocks.revoke(stored);
      await options.stores.session.del(key);
    },
  }));
});
afterEach(() => vi.useRealTimers());

describe("cookie-backed OAuth", () => {
  it("declares the private workspace scopes in OAuth metadata", async () => {
    await getOAuth(browser().cookies, origin);
    expect(mocks.createOAuth.mock.lastCall![0].scopes).toEqual(storageScopes);
    expect(storageScopes).toContain(
      "space:app.pileofmemories.prototype.workspace?skey=self&manage=create",
    );
    expect(storageScopes.some((scope) => scope.startsWith("repo:"))).toBe(false);
  });

  it("uses Netlify preview and branch origins instead of inherited production configuration", async () => {
    for (const context of ["deploy-preview", "branch-deploy"]) {
      mocks.context = context;
      mocks.deployUrl = "https://deploy-preview-42--memories.netlify.app";
      const client = browser();
      await getOAuth(client.cookies, new URL(mocks.deployUrl));
      const options = mocks.createOAuth.mock.lastCall![0] as Options;
      expect(options.baseUrl).toBe(mocks.deployUrl);
      expect(() => getOAuth(client.cookies, origin)).toThrow("AUTH_ORIGIN");
      await options.stores.session.set(did, session);
      const cookie = client.values.get(SESSION_COOKIE);
      expect(verifySessionCookie(cookie)).toBe(did);
      mocks.context = "production";
      expect(verifySessionCookie(cookie)).toBeNull();
      await getOAuth(client.cookies, origin);
      expect(mocks.createOAuth.mock.lastCall![0].baseUrl).toBe(origin.origin);
    }
  });

  it("fails closed if Netlify preview metadata is missing", () => {
    mocks.context = "deploy-preview";
    expect(() => getOAuth(browser().cookies, origin)).toThrow("DEPLOY_PRIME_URL");
    expect(mocks.createOAuth).not.toHaveBeenCalled();
  });

  it("carries encrypted state and sessions to a fresh request without sharing browsers", async () => {
    const first = browser();
    const firstStores = await stores(first.cookies);
    await firstStores.state!.set("callback", state);
    await firstStores.session.set(did, session);
    expect(first.set).toHaveBeenCalledWith(
      SESSION_COOKIE,
      expect.any(String),
      expect.objectContaining({
        path: "/",
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        maxAge: 2_592_000,
      }),
    );
    expect(first.set).toHaveBeenCalledWith(
      "pom_oauth_state",
      expect.any(String),
      expect.objectContaining({
        path: "/auth",
        maxAge: 600,
      }),
    );
    expect(Buffer.from(first.values.get(SESSION_COOKIE)!, "base64url").toString()).not.toContain(
      "private-token",
    );
    const next = browser(first.values);
    const nextStores = await stores(next.cookies);
    expect(await nextStores.state!.get("callback")).toEqual(state);
    expect(await nextStores.state!.get("wrong-state")).toBeUndefined();
    expect(await nextStores.session.get(did)).toEqual(session);
    expect(verifySessionCookie(next.values.get(SESSION_COOKIE))).toBe(did);
    const otherStores = await stores(browser().cookies);
    expect(await otherStores.session.get(did)).toBeUndefined();
    expect(await otherStores.state!.get("callback")).toBeUndefined();
    await nextStores.state!.del("callback");
    expect(next.values.has("pom_oauth_state")).toBe(false);
  });

  it("rejects tampering, cookie substitution, unapproved identities and legacy cookies", async () => {
    const client = browser();
    const store = await stores(client.cookies);
    await store.session.set(did, session);
    const encrypted = Buffer.from(client.values.get(SESSION_COOKIE)!, "base64url");
    encrypted[encrypted.length - 1] ^= 1;
    expect(verifySessionCookie(encrypted.toString("base64url"))).toBeNull();
    expect(verifySessionCookie(undefined)).toBeNull();
    expect(verifySessionCookie("did:plc:owner|old-signature")).toBeNull();
    await store.state!.set(did, state);
    expect(verifySessionCookie(client.values.get("pom_oauth_state"))).toBeNull();
    await store.session.set("did:plc:other", session);
    expect(verifySessionCookie(client.values.get(SESSION_COOKIE))).toBeNull();
  });

  it("enforces state and session expiry on the server even when cookies are replayed", async () => {
    vi.useFakeTimers();
    const client = browser();
    const store = await stores(client.cookies);
    await store.state!.set("callback", state);
    await store.session.set(did, session);
    vi.advanceTimersByTime(600_000);
    expect(await store.state!.get("callback")).toBeUndefined();
    expect(verifySessionCookie(client.values.get(SESSION_COOKIE))).toBe(did);
    vi.advanceTimersByTime(2_592_000_000);
    expect(await store.session.get(did)).toBeUndefined();
    expect(verifySessionCookie(client.values.get(SESSION_COOKIE))).toBeNull();
  });

  it("revokes using the session before clearing its cookie", async () => {
    const client = browser();
    await (await stores(client.cookies)).session.set(did, session);
    await destroySession(did, client.cookies, origin);
    expect(mocks.revoke).toHaveBeenCalledWith(session);
    expect(client.values.has(SESSION_COOKIE)).toBe(false);
  });

  it("rejects oversized payloads without overwriting an existing cookie", async () => {
    const client = browser();
    const store = await stores(client.cookies);
    await store.session.set(did, session);
    const before = client.values.get(SESSION_COOKIE);
    await expect(
      store.session.set(did, { ...session, padding: "x".repeat(4000) } as NodeSavedSession),
    ).rejects.toThrow("cookie size limit");
    expect(client.values.get(SESSION_COOKIE)).toBe(before);
  });

  it("uses the canonical origin and never caches request cookies", async () => {
    const first = browser();
    expect(() => getOAuth(first.cookies, new URL("https://alias.example"))).toThrow("AUTH_ORIGIN");
    expect(mocks.createOAuth).not.toHaveBeenCalled();
    await getOAuth(first.cookies, origin);
    await getOAuth(browser().cookies, origin);
    expect(mocks.createOAuth).toHaveBeenCalledTimes(2);
    expect(mocks.createOAuth.mock.lastCall![0].baseUrl).toBe(origin.origin);
  });
});
