import { afterEach, expect, it, vi } from "vite-plus/test";
import { chat } from "@tanstack/ai";
import { explorationCandidates, generateReflection, suggestRelatedCards } from "./exploration";
import type { Card } from "../card";
import { buildIdeaDraft, reflectionInputSchema } from "../exploration";

vi.mock("$app/env/private", () => ({
  TYPESAFE_API_KEY: "test-typesafe",
  OPENCODE_API_KEY: "test-zen",
}));
vi.mock("@tanstack/ai", async (original) => ({
  ...(await original<typeof import("@tanstack/ai")>()),
  chat: vi.fn(),
}));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

function card(index: number, changes: Partial<Card> = {}): Card {
  return {
    id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    title: `Card ${index}`,
    body: "A thought",
    kind: "note",
    tags: [],
    topics: [],
    position: { x: 0, y: 0 },
    archived: false,
    links: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...changes,
  };
}

it("keeps candidate work bounded while including recent cards outside lexical matches", () => {
  const seed = card(1, { body: "walking", topics: ["walking"] });
  const matches = Array.from({ length: 30 }, (_, i) =>
    card(i + 2, { body: "walking", topics: ["walking"] }),
  );
  const recent = card(40, { body: "offline conversations", updatedAt: "2026-10-01T00:00:00.000Z" });
  const archived = card(41, { archived: true });
  const candidates = explorationCandidates(seed, [seed, ...matches, recent, archived], "");
  expect(candidates).toHaveLength(24);
  expect(candidates).toContain(recent);
  expect(candidates).not.toContain(seed);
  expect(candidates).not.toContain(archived);
  expect(new Set(candidates.map(({ id }) => id)).size).toBe(24);
});

it("batches TypeSafe judgments, ranks useful perspectives, and omits unrelated/weak cards", async () => {
  const fetchMock = vi.fn().mockResolvedValue(
    Response.json({
      model: "jev-1.13.0",
      usage: { input_tokens: 100, output_tokens: 30 },
      answers: Object.fromEntries(
        [2.5, 3, 1, 3].flatMap((score, i) => [
          [
            `relevance_${i}`,
            {
              type: "score",
              score,
              confidence: 0.9,
              legend: {},
              probabilities: { "0": 0, "1": 0, "2": 0.5, "3": 0.5 },
            },
          ],
          [
            `relationship_${i}`,
            {
              type: "choice",
              choice: ["another_angle", "counterpoint", "shared_theme", "unrelated"][i],
              confidence: 0.9,
              probabilities: {
                shared_theme: 0,
                another_angle: 0,
                counterpoint: 0,
                unrelated: 0,
                [["another_angle", "counterpoint", "shared_theme", "unrelated"][i]!]: 1,
              },
            },
          ],
        ]),
      ),
    }),
  );
  vi.stubGlobal("fetch", fetchMock);
  const cards = [card(1), card(2), card(3), card(4), card(5), card(6, { archived: true })];
  const signal = new AbortController().signal;
  expect(await suggestRelatedCards(cards[0]!, cards, "What could I try?", signal)).toEqual({
    suggestions: [
      { cardId: cards[2]!.id, relationship: "counterpoint" },
      { cardId: cards[1]!.id, relationship: "another_angle" },
    ],
    scannedCount: 4,
    totalCount: 4,
  });
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const request = fetchMock.mock.calls[0]![1];
  expect(request.signal).toBe(signal);
  const body = JSON.parse(request.body);
  expect(Object.keys(body.questions)).toHaveLength(8);
  expect(body.state.question).toBe("What could I try?");
  expect(body.questions.relevance_0.instructions).toContain("complementary");
});

it("needs no provider call for an otherwise empty pile", async () => {
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  const seed = card(1);
  expect(await suggestRelatedCards(seed, [seed], "", new AbortController().signal)).toEqual({
    suggestions: [],
    scannedCount: 0,
    totalCount: 0,
  });
  expect(fetchMock).not.toHaveBeenCalled();
});

it("rejects invented reflection sources and accepts cited proposals", async () => {
  const cards = [card(1), card(2)];
  const reflection = {
    observations: [{ text: "A common thread.", sourceIds: [cards[0]!.id] }],
    ideas: [
      {
        title: "Try a walking conversation",
        body: "Invite a friend for a walk.",
        sourceIds: cards.map(({ id }) => id),
      },
    ],
    questions: ["What would make this easy?"],
  };
  vi.mocked(chat).mockResolvedValueOnce(reflection);
  expect(await generateReflection(cards, "What could I try?", new AbortController())).toEqual(
    reflection,
  );
  expect(vi.mocked(chat).mock.calls[0]![0]).toMatchObject({
    messages: [{ role: "user", content: expect.stringContaining(cards[0]!.id) }],
  });
  vi.mocked(chat).mockResolvedValueOnce({
    ...reflection,
    observations: [{ text: "Invented", sourceIds: [card(99).id] }],
  });
  await expect(generateReflection(cards, "", new AbortController())).rejects.toThrow(
    "outside the selected context",
  );
});

it("creates editable idea Markdown with durable source links and unique citations", () => {
  const source = card(1, { title: "A [walking] idea" });
  const draft = buildIdeaDraft(
    { title: "Walking together", body: "Try a walk.", sourceIds: [source.id, source.id] },
    [source],
    " What might work? ",
  );
  expect(draft.kind).toBe("idea");
  expect(draft.body).toContain("## Exploration question\n\nWhat might work?");
  expect(draft.body).toContain(`[A \\[walking\\] idea](?memory=${source.id})`);
  expect(draft.body.match(/\?memory=/g)).toHaveLength(1);
  expect(reflectionInputSchema.safeParse({ cardIds: [source.id, source.id] }).success).toBe(false);
  expect(
    reflectionInputSchema.safeParse({ cardIds: Array.from({ length: 9 }, (_, i) => card(i).id) })
      .success,
  ).toBe(false);
});
