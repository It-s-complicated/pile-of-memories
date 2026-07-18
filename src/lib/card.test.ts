import { describe, expect, it } from "vite-plus/test";
import {
  createCardRequestSchema,
  deleteCardCommandSchema,
  isCardId,
  parseCardChanges,
  parseCardInput,
  updateCardCommandSchema,
  updateCardPositionsCommandSchema,
} from "./card";

const CARD_ID = "00000000-0000-4000-8000-000000000001";
const validCard = {
  id: CARD_ID,
  title: "  Capture this  ",
  body: "Read [the reference](https://example.com/docs).",
  position: { x: 12, y: -4 },
  tags: [" job ", "Concept"],
  topics: ["CSS", "css"],
  links: [],
  archived: false,
};

describe("card creation validation", () => {
  it("normalizes titles and labels and derives links from the body", () => {
    expect(parseCardInput(validCard)).toEqual({
      ...validCard,
      title: "Capture this",
      tags: ["Job"],
      topics: ["Concept", "CSS"],
      links: ["https://example.com/docs"],
    });
  });

  it.each([
    ["unknown properties", { ...validCard, privateField: "nope" }],
    ["invalid UUIDs", { ...validCard, id: "card-1" }],
    ["empty titles", { ...validCard, title: "   " }],
    ["non-finite positions", { ...validCard, position: { x: Number.POSITIVE_INFINITY, y: 0 } }],
    ["overlong labels", { ...validCard, tags: ["x".repeat(41)] }],
  ])("rejects %s", (_case, input) => {
    expect(parseCardInput(input)).toBeNull();
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
    expect(isCardId(CARD_ID)).toBe(true);
    expect(isCardId("not-a-card-id")).toBe(false);
  });
});

describe("card change validation", () => {
  it("normalizes changes and derives links only from a supplied body", () => {
    expect(
      parseCardChanges({
        title: "  Updated  ",
        body: "Visit https://example.org.",
        tags: ["Personal development", "Svelte"],
        topics: ["CSS"],
        links: [],
        archived: true,
      }),
    ).toEqual({
      title: "Updated",
      body: "Visit https://example.org.",
      tags: ["Personal development"],
      topics: ["Svelte", "CSS"],
      links: ["https://example.org"],
      archived: true,
    });
  });

  it.each([
    ["empty patches", {}],
    ["unknown properties", { title: "Updated", extra: true }],
    ["non-finite positions", { position: { x: Number.NaN, y: 0 } }],
    ["empty titles", { title: "  " }],
    ["tags without topics", { tags: ["Job"] }],
    ["topics without tags", { topics: ["CSS"] }],
    ["links without a body", { links: ["https://example.com"] }],
  ])("rejects %s", (_case, changes) => {
    expect(parseCardChanges(changes)).toBeNull();
  });

  it("accepts archive-only changes and validates remote command IDs", () => {
    expect(parseCardChanges({ archived: false })).toEqual({ archived: false });
    expect(
      updateCardCommandSchema.safeParse({ id: CARD_ID, changes: { archived: true } }).success,
    ).toBe(true);
    expect(
      updateCardCommandSchema.safeParse({ id: "invalid", changes: { archived: true } }).success,
    ).toBe(false);
    expect(deleteCardCommandSchema.safeParse({ id: CARD_ID }).success).toBe(true);
    expect(deleteCardCommandSchema.safeParse({ id: CARD_ID, extra: true }).success).toBe(false);
  });

  it("validates bounded position batches before database work", () => {
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
