import type { RequestEvent } from "@sveltejs/kit";
import { github } from "better-auth/social-providers";
import { beforeAll, expect, it, vi } from "vite-plus/test";
import type { Card } from "#lib/card.js";
import type { LabelDefinition } from "#lib/labels.js";
import { enrichMemory } from "#lib/server/enrichment.js";
import { generateReflection, suggestRelatedCards } from "#lib/server/exploration.js";
import { withMockedServices } from "./server.js";

const env = vi.hoisted(() => ({ database: "postgresql://mock@127.0.0.1/board_mock" }));
vi.mock("$app/env/private", () => ({
  APPROVED_GITHUB_PROVIDER_ID: "1",
  OPENCODE_API_KEY: "mock",
  TYPESAFE_API_KEY: "mock",
  get DATABASE_CONNECTION_STRING() {
    return env.database;
  },
}));

const AUTHORIZE_URL =
  "https://github.com/login/oauth/authorize?client_id=mock&state=abc" +
  "&redirect_uri=http%3A%2F%2Flocalhost%3A5173%2Fapi%2Fauth%2Fcallback%2Fgithub";

function card(index: number, title: string, body: string): Card {
  return {
    id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    title,
    body,
    kind: "note",
    tags: [],
    topics: [],
    position: { x: 0, y: 0 },
    archived: false,
    links: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function label(index: number, name: string, kind: LabelDefinition["kind"]): LabelDefinition {
  return { ...card(index, name, ""), name, kind, description: "" };
}

function request(handle: ReturnType<typeof withMockedServices>, path: string) {
  return handle({
    event: { url: new URL(path, "http://localhost:5173") } as RequestEvent,
    resolve: () => Promise.resolve(new Response()),
  });
}

// These drive the app's real provider code, so a request the mocks cannot answer fails here.
let handle: ReturnType<typeof withMockedServices>;
beforeAll(() => {
  handle = withMockedServices(() =>
    Response.json(
      { url: AUTHORIZE_URL, redirect: true },
      { headers: [["set-cookie", "state=abc"]] },
    ),
  );
});

it("titles and labels a memory without a model", async () => {
  const { output } = await enrichMemory(
    { description: "## Grid tricks\n\nAn idea for laying out cards with CSS subgrid." },
    [label(1, "CSS", "topic"), label(2, "Finance", "topic"), label(3, "Project", "tag")],
  );

  expect(output).toEqual({ kind: "idea", title: "Grid tricks", tags: [], topics: ["CSS"] });
});

it("relates cards that share long words", async () => {
  const seed = card(1, "Offline sync", "Local-first databases keep working without network.");
  const related = card(2, "Replication", "Databases that replicate over a flaky network.");
  const unrelated = card(3, "Sourdough", "Feed the starter every morning.");

  const result = await suggestRelatedCards(
    seed,
    [seed, related, unrelated],
    "",
    AbortSignal.timeout(5_000),
  );

  expect(result.suggestions).toEqual([{ cardId: related.id, relationship: "shared_theme" }]);
});

it("reflects on the selected cards and cites only them", async () => {
  const cards = [card(1, "Offline sync", "Notes"), card(2, "Replication", "Notes")];

  const reflection = await generateReflection(cards, "What connects these?", new AbortController());

  expect(reflection.observations[0]?.text).toContain("“Offline sync”, “Replication”");
  expect(reflection.ideas[0]?.sourceIds).toEqual(cards.map(({ id }) => id));
});

it("signs in as the approved GitHub account", async () => {
  const provider = github({ clientId: "mock", clientSecret: "mock" });
  const tokens = await provider.validateAuthorizationCode({
    code: "mock-code",
    redirectURI: "http://localhost:5173/api/auth/callback/github",
  });

  const account = await provider.getUserInfo(tokens!);

  expect(account?.data.id).toBe(1);
  expect(account?.user).toMatchObject({ name: "Mock Owner", emailVerified: true });
});

it("sends a sign-in straight to the app's callback instead of GitHub", async () => {
  const response = await request(handle, "/api/auth/sign-in/social");

  expect(await response.json()).toEqual({
    url: "http://localhost:5173/api/auth/callback/github?code=mock-code&state=abc",
    redirect: true,
  });
  expect(response.headers.getSetCookie()).toEqual(["state=abc"]);
  expect(await (await request(handle, "/")).json()).toMatchObject({ url: AUTHORIZE_URL });
});

it("fails requests to services that are not mocked", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});

  await expect(fetch("https://example.com/")).rejects.toMatchObject({
    cause: { message: expect.stringContaining("[MSW]") },
  });
});

it("refuses to start against a database that is not a mock", () => {
  env.database = "postgresql://owner@127.0.0.1:15432/postgres";

  expect(() => withMockedServices(() => new Response())).toThrow("ends in _mock");
});
