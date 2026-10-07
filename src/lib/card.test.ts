import { describe, expect, it } from "vite-plus/test";
import {
  cardChangesSchema,
  cardIdSchema,
  cardInputSchema,
  createCardRequestSchema,
  createCardFormSchema,
  updateCardFormSchema,
  deleteCardCommandSchema,
  memoryListSettingsSchema,
  sortAndFilterCards,
  type Card,
  updateCardCommandSchema,
  updateCardPositionsCommandSchema,
} from "./card";

const CARD_ID = "00000000-0000-4000-8000-000000000001";
const validCard = {
  kind: "memory" as const,
  id: CARD_ID,
  title: "  Capture this  ",
  body: "Read [the reference](https://example.com/docs).",
  position: { x: 12, y: -4 },
  tags: [" job ", "Concept"],
  topics: ["CSS", "css"],
  archived: false,
};

describe("card creation validation", () => {
  it("normalizes titles and labels without writing derived links", () => {
    expect(cardInputSchema.safeParse(validCard)).toEqual({
      success: true,
      data: {
        ...validCard,
        title: "Capture this",
        tags: ["job", "Concept"],
        topics: ["CSS"],
      },
    });
  });

  it.each([
    ["unknown properties", { ...validCard, privateField: "nope" }],
    ["derived links", { ...validCard, links: ["https://example.com/docs"] }],
    ["invalid UUIDs", { ...validCard, id: "card-1" }],
    ["empty titles", { ...validCard, title: "   " }],
    ["non-finite positions", { ...validCard, position: { x: Number.POSITIVE_INFINITY, y: 0 } }],
    ["overlong labels", { ...validCard, tags: ["x".repeat(41)] }],
  ])("rejects %s", (_case, input) => {
    expect(cardInputSchema.safeParse(input).success).toBe(false);
  });

  it("validates the remote creation envelope without trusting extra fields", () => {
    const creation = {
      enrichmentAttemptId: "00000000-0000-4000-8000-000000000002",
      resultSource: "ai",
      reviewStartedAt: "2026-01-01T12:00:00.000Z",
    };

    expect(createCardRequestSchema.safeParse({ card: validCard, creation }).success).toBe(true);
    expect(
      createCardRequestSchema.safeParse({ card: validCard, creation, generatedTitle: "private" })
        .success,
    ).toBe(false);
    expect(cardIdSchema.safeParse(CARD_ID).success).toBe(true);
    expect(cardIdSchema.safeParse("not-a-card-id").success).toBe(false);
  });
});

describe("card forms", () => {
  it("normalizes omitted HTML controls without weakening validation", () => {
    const { archived: _archived, tags: _tags, topics: _topics, ...card } = validCard;
    expect(
      createCardFormSchema.parse({ card, creation: { resultSource: "fallback" } }),
    ).toMatchObject({
      card: { archived: false, tags: [], topics: [] },
      creation: { enrichmentAttemptId: null, resultSource: "fallback" },
    });
    const tags = Array.from({ length: 101 }, (_, index) => `Tag ${index}`);
    const topics = Array.from({ length: 100 }, (_, index) => `Topic ${index}`);
    expect(createCardFormSchema.safeParse({ card: { ...card, tags, topics } }).success).toBe(false);
    expect(updateCardFormSchema.safeParse({ id: CARD_ID, changes: { tags, topics } }).success).toBe(
      false,
    );
    expect(
      createCardFormSchema.safeParse({ card: { ...card, position: { x: NaN, y: 0 } } }).success,
    ).toBe(false);
  });
});

describe("card change validation", () => {
  it("normalizes content changes without writing derived links", () => {
    expect(
      cardChangesSchema.safeParse({
        title: "  Updated  ",
        body: "Visit https://example.org.",
        tags: ["Personal development", "Svelte"],
        topics: ["CSS"],
        archived: true,
      }),
    ).toEqual({
      success: true,
      data: {
        title: "Updated",
        body: "Visit https://example.org.",
        tags: ["Personal development", "Svelte"],
        topics: ["CSS"],
        archived: true,
      },
    });
  });

  it.each([
    ["empty patches", {}],
    ["unknown properties", { title: "Updated", extra: true }],
    ["non-finite positions", { position: { x: Number.NaN, y: 0 } }],
    ["empty titles", { title: "  " }],
    ["tags without topics", { tags: ["Job"] }],
    ["topics without tags", { topics: ["CSS"] }],
    ["derived links", { body: "https://example.com", links: ["https://example.com"] }],
  ])("rejects %s", (_case, changes) => {
    expect(cardChangesSchema.safeParse(changes).success).toBe(false);
  });

  it("accepts archive-only changes and validates remote command IDs", () => {
    expect(cardChangesSchema.safeParse({ archived: false })).toEqual({
      success: true,
      data: { archived: false },
    });
    expect(
      updateCardCommandSchema.safeParse({ id: CARD_ID, changes: { archived: true } }).success,
    ).toBe(true);
    expect(
      updateCardCommandSchema.safeParse({ id: "invalid", changes: { archived: true } }).success,
    ).toBe(false);
    expect(deleteCardCommandSchema.safeParse({ id: CARD_ID }).success).toBe(true);
    expect(deleteCardCommandSchema.safeParse({ id: CARD_ID, extra: true }).success).toBe(false);
  });

  it("accepts reorganizations with more than 200 changed cards", () => {
    const positions = Array.from({ length: 501 }, (_, index) => ({
      id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
      position: { x: index * 10, y: -index },
    }));
    expect(updateCardPositionsCommandSchema.parse({ positions }).positions).toEqual(positions);
    expect(
      updateCardPositionsCommandSchema.safeParse({
        positions: [...positions, positions[0]],
      }).success,
    ).toBe(false);
    expect(
      updateCardPositionsCommandSchema.safeParse({
        positions: positions.map((entry, index) =>
          index === 0 ? { ...entry, position: { x: Infinity, y: 0 } } : entry,
        ),
      }).success,
    ).toBe(false);
  });

  it("validates position batches before database work", () => {
    const position = { x: 1, y: 2 };
    expect(
      updateCardPositionsCommandSchema.safeParse({ positions: [{ id: CARD_ID, position }] })
        .success,
    ).toBe(true);
    expect(updateCardPositionsCommandSchema.safeParse({ positions: [] }).success).toBe(false);
    expect(
      updateCardPositionsCommandSchema.safeParse({
        positions: [
          { id: CARD_ID, position },
          { id: CARD_ID, position: { x: 3, y: 4 } },
        ],
      }).success,
    ).toBe(false);
  });
});

describe("memory list", () => {
  const cards: Card[] = [
    {
      ...validCard,
      title: "Beta",
      kind: "note" as const,
      tags: ["Job"],
      topics: [],
      links: ["https://example.com/docs"],
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-03T00:00:00.000Z",
    },
    {
      ...validCard,
      id: "00000000-0000-4000-8000-000000000002",
      title: "Alpha",
      tags: ["Project"],
      topics: ["CSS"],
      links: ["https://example.com/docs"],
      createdAt: "2026-01-02T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z",
    },
  ];

  it("validates settings, matches any selected tag, and sorts the result", () => {
    const settings = memoryListSettingsSchema.parse({
      sort: "title-asc",
      tags: ["job", "css"],
    });

    expect(sortAndFilterCards(cards, settings).map(({ title }) => title)).toEqual([
      "Alpha",
      "Beta",
    ]);
    expect(memoryListSettingsSchema.safeParse({ sort: "random", tags: [] }).success).toBe(false);
  });

  it("matches any selected kind and defaults to no kind filter", () => {
    expect(
      sortAndFilterCards(cards, { sort: "title-asc", kinds: ["note"], tags: [] }).map(
        ({ title }) => title,
      ),
    ).toEqual(["Beta"]);
    expect(
      sortAndFilterCards(cards, { sort: "title-asc", kinds: [], tags: [] }).map(
        ({ title }) => title,
      ),
    ).toEqual(["Alpha", "Beta"]);
  });
});
