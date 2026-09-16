import { createHmac } from "node:crypto";
import { AUTH_SECRET, APPROVED_ATPROTO_DID } from "$app/env/private";
import { describe, expect, it } from "vite-plus/test";
import { verifySessionCookie } from "./auth";

const did = APPROVED_ATPROTO_DID;
const signed = (value: string) =>
  `${value}|${createHmac("sha256", AUTH_SECRET).update(value).digest("base64url")}`;

describe("AT Protocol session cookie", () => {
  it("accepts the signed approved DID", () => {
    expect(verifySessionCookie(signed(did))).toBe(did);
  });

  it("rejects forged, unapproved, or missing cookies", () => {
    expect(verifySessionCookie(`${did}|forged`)).toBe(null);
    expect(verifySessionCookie(signed("did:plc:someone-else"))).toBe(null);
    expect(verifySessionCookie(undefined)).toBe(null);
  });
});
