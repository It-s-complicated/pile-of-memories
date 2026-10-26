import { beforeEach, expect, it, vi } from "vite-plus/test";

const { getRequestEvent, listCards, suggestRelatedCards, generateReflection } = vi.hoisted(() => ({
  getRequestEvent: vi.fn(),
  listCards: vi.fn(),
  suggestRelatedCards: vi.fn(),
  generateReflection: vi.fn(),
}));
const analytics = vi.hoisted(() => ({
  recordExplorationRunStarted: vi.fn(),
  recordExplorationRunCompleted: vi.fn(),
}));
vi.mock("$app/server", () => ({
  getRequestEvent,
  command: (schema: { parse: (value: unknown) => unknown }, handler: (input: unknown) => unknown) =>
    Object.assign(async (input: unknown) => handler(schema.parse(input)), {
      __: { type: "command" },
    }),
}));
vi.mock("#lib/server/database.js", () => ({ listCards, ...analytics }));
vi.mock("#lib/server/exploration.js", () => ({
  suggestRelatedCards,
  generateReflection,
  REFLECTION_MODEL: "test-reflection",
}));
import { suggestExploration, reflectOnCards } from "./exploration.remote";
const id = "00000000-0000-4000-8000-000000000001";
const archivedId = "00000000-0000-4000-8000-000000000002";

beforeEach(() => {
  vi.clearAllMocks();
  getRequestEvent.mockReturnValue({
    locals: { user: { id: "owner" } },
    request: { signal: new AbortController().signal },
  });
  listCards.mockResolvedValue([
    { id, title: "Server title", body: "Server content", archived: false },
    { id: archivedId, archived: true },
  ]);
  suggestRelatedCards.mockResolvedValue({ suggestions: [], scannedCount: 0, totalCount: 0 });
  generateReflection.mockResolvedValue({ observations: [], ideas: [], questions: [] });
  analytics.recordExplorationRunStarted.mockResolvedValue(undefined);
  analytics.recordExplorationRunCompleted.mockResolvedValue(undefined);
});

it("requires authentication before reading cards or calling providers", async () => {
  getRequestEvent.mockReturnValue({ locals: { user: null } });
  await expect(suggestExploration({ seedId: id, question: "" })).rejects.toMatchObject({
    status: 401,
  });
  await expect(reflectOnCards({ cardIds: [id], question: "" })).rejects.toMatchObject({
    status: 401,
  });
  expect(listCards).not.toHaveBeenCalled();
  expect(suggestRelatedCards).not.toHaveBeenCalled();
  expect(generateReflection).not.toHaveBeenCalled();
});

it("resolves content on the server and excludes archived cards", async () => {
  await suggestExploration({ seedId: id, question: "  Connections?  " });
  expect(suggestRelatedCards).toHaveBeenCalledWith(
    expect.objectContaining({ id, body: "Server content" }),
    [expect.objectContaining({ id })],
    "Connections?",
    expect.any(AbortSignal),
    expect.any(Function),
  );
  await reflectOnCards({ cardIds: [id], question: "" });
  expect(generateReflection).toHaveBeenCalledWith(
    [expect.objectContaining({ id, body: "Server content" })],
    "",
    expect.any(AbortController),
    expect.any(Function),
  );
  await expect(reflectOnCards({ cardIds: [archivedId], question: "" })).rejects.toMatchObject({
    status: 409,
  });
  await expect(suggestExploration({ seedId: archivedId, question: "" })).rejects.toMatchObject({
    status: 404,
  });
  expect(generateReflection).toHaveBeenCalledTimes(1);
});

it("records operation metrics and usage without retaining card text or questions", async () => {
  const sessionId = "00000000-0000-4000-8000-000000000003";
  suggestRelatedCards.mockImplementationOnce(async (_seed, _cards, _question, _signal, onUsage) => {
    onUsage({ promptTokens: 40, completionTokens: 5, totalTokens: 45 });
    return { suggestions: [], scannedCount: 12, totalCount: 20 };
  });
  await suggestExploration({ seedId: id, question: "A private question", sessionId });
  expect(analytics.recordExplorationRunStarted).toHaveBeenCalledWith(
    expect.objectContaining({ sessionId, operation: "related", questionCharacterCount: 18 }),
  );
  expect(analytics.recordExplorationRunCompleted).toHaveBeenCalledWith(
    expect.objectContaining({
      sessionId,
      status: "succeeded",
      usage: { promptTokens: 40, completionTokens: 5, totalTokens: 45, providerCost: null },
      metrics: { candidateCount: 12, suggestionCount: 0 },
    }),
  );
  expect(JSON.stringify(analytics.recordExplorationRunCompleted.mock.calls)).not.toContain(
    "Server content",
  );
  expect(JSON.stringify(analytics.recordExplorationRunCompleted.mock.calls)).not.toContain(
    "A private question",
  );
  const result = await reflectOnCards({ cardIds: [id], question: "", sessionId });
  expect(result.runId).toBe(analytics.recordExplorationRunStarted.mock.calls.at(-1)![0].id);
});

it("records failed operations and tolerates analytics write failures", async () => {
  suggestRelatedCards.mockRejectedValueOnce(new SyntaxError("Private provider output"));
  await expect(suggestExploration({ seedId: id, question: "" })).rejects.toMatchObject({
    status: 502,
  });
  expect(analytics.recordExplorationRunCompleted).toHaveBeenCalledWith(
    expect.objectContaining({ status: "failed", errorCode: "invalid_provider_json" }),
  );
  analytics.recordExplorationRunStarted.mockRejectedValueOnce(new Error("Database down"));
  analytics.recordExplorationRunCompleted.mockRejectedValueOnce(new Error("Database down"));
  const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  await expect(suggestExploration({ seedId: id, question: "" })).resolves.toHaveProperty(
    "suggestions",
  );
  consoleError.mockRestore();
});

it("does not expose provider errors or private payloads", async () => {
  suggestRelatedCards.mockRejectedValue(new Error("Private provider payload and key"));
  await expect(suggestExploration({ seedId: id, question: "" })).rejects.toMatchObject({
    status: 502,
    body: { message: "Exploration is unavailable right now. Please try again." },
  });
});
