import { APPROVED_GITHUB_PROVIDER_ID } from "$app/env/private";
import { http, HttpResponse } from "msw";
import * as z from "zod";

const EMAIL = "owner@pile-of-memories.test";
const signInSchema = z.object({ url: z.url() }).loose();

/** GitHub's token exchange and profile lookups, always answering as the approved account. */
export const githubHandlers = [
  http.post("https://github.com/login/oauth/access_token", () =>
    HttpResponse.json({
      access_token: "mock-github-token",
      token_type: "bearer",
      scope: "read:user,user:email",
    }),
  ),
  http.get("https://api.github.com/user", () =>
    HttpResponse.json({
      id: Number(APPROVED_GITHUB_PROVIDER_ID),
      login: "mock-owner",
      name: "Mock Owner",
      email: EMAIL,
      avatar_url: null,
    }),
  ),
  http.get("https://api.github.com/user/emails", () =>
    HttpResponse.json([{ email: EMAIL, primary: true, verified: true, visibility: "private" }]),
  ),
];

/**
 * Stands in for GitHub's approval page, the one step that happens in the browser and so never
 * reaches MSW. Better Auth answers a sign-in with GitHub's authorize URL; this sends the browser
 * straight to the app's own callback, as GitHub would after the owner approves.
 */
export async function approveGitHubSignIn(response: Response): Promise<Response> {
  if (!response.ok) return response;
  const body = signInSchema.parse(await response.json());
  const authorize = new URL(body.url);
  const callback = new URL(authorize.searchParams.get("redirect_uri") ?? "");
  callback.searchParams.set("code", "mock-code");
  callback.searchParams.set("state", authorize.searchParams.get("state") ?? "");

  const headers = new Headers(response.headers);
  headers.delete("content-length");
  return Response.json({ ...body, url: callback.href }, { status: response.status, headers });
}
