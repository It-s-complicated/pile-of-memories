import { describe, expect, it } from "vite-plus/test";
import { cardChangesSchema, cardInputSchema } from "./card";
import { cardToMemoryNode, getMinimapColors, getPrimaryTagAccent, getTopicTagColor } from "./scene";

describe("board", () => {
  it("colors labels from one OKLCH family, hue per tag", () => {
    expect(getPrimaryTagAccent("web development")).toBe("oklch(0.46 0.09 255)");
    expect(getPrimaryTagAccent("project")).toBe("oklch(0.46 0.09 354)");
    expect(getPrimaryTagAccent("unknown")).toBe("var(--theme-ink)");
    expect(getTopicTagColor("AI")).toBe("oklch(0.44 0.08 195)");
    expect(getTopicTagColor("Vue")).toBe("oklch(0.44 0.08 160)");
    expect(getTopicTagColor("unknown")).toBe("var(--muted)");
    expect(getMinimapColors(["job", "web development", "unknown"])).toEqual([
      "oklch(0.62 0.1 145)",
      "oklch(0.62 0.1 255)",
    ]);
    expect(getMinimapColors([])).toEqual(["color-mix(in oklch, var(--muted) 45%, var(--paper))"]);
  });
});

describe("card writes", () => {
  const card = {
    id: "00000000-0000-4000-8000-000000000001",
    title: "  Capture  ",
    body: "Remember [this](https://example.com) and https://example.org.",
    position: { x: 10, y: 20 },
    tags: ["personal development"],
    topics: ["CSS", "css"],
    archived: false,
  };

  it("normalizes labels and rejects derived links in writes", () => {
    expect(cardInputSchema.safeParse(card)).toMatchObject({
      success: true,
      data: {
        title: "Capture",
        tags: ["Personal development"],
        topics: ["CSS"],
      },
    });
    expect(cardInputSchema.safeParse({ ...card, links: ["javascript:alert(1)"] }).success).toBe(
      false,
    );
    expect(
      cardChangesSchema.safeParse({ body: "No links", links: ["https://example.com"] }).success,
    ).toBe(false);
    expect(cardChangesSchema.parse({ body: "No links" })).toEqual({ body: "No links" });
    expect(cardChangesSchema.safeParse({ links: [] }).success).toBe(false);
  });

  it("rejects invalid IDs, positions, and partial label updates", () => {
    expect(cardInputSchema.safeParse({ ...card, id: "starter-capture" }).success).toBe(false);
    expect(cardChangesSchema.safeParse({ position: { x: Number.NaN, y: 0 } }).success).toBe(false);
    expect(cardChangesSchema.safeParse({ tags: ["Job"] }).success).toBe(false);
    expect(cardChangesSchema.safeParse({ archived: true })).toEqual({
      success: true,
      data: { archived: true },
    });
    expect(cardChangesSchema.safeParse({ archived: "yes" }).success).toBe(false);
  });

  it("defaults legacy cards to memory and preserves each kind through canvas conversion", () => {
    expect(cardInputSchema.safeParse(card)).toMatchObject({
      success: true,
      data: { kind: "memory" },
    });
    for (const kind of ["memory", "idea", "note"] as const) {
      const parsed = cardInputSchema.safeParse({ ...card, kind });
      if (!parsed.success) throw parsed.error;
      const node = cardToMemoryNode({
        ...parsed.data,
        links: ["https://example.com", "https://example.org"],
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      });
      expect(node.type).toBe("memory");
      expect(node.data.kind).toBe(kind);
      expect(node.data.links).toEqual(["https://example.com", "https://example.org"]);
      expect(cardChangesSchema.safeParse({ kind })).toEqual({ success: true, data: { kind } });
    }
    expect(cardInputSchema.safeParse({ ...card, kind: "task" }).success).toBe(false);
    expect(cardChangesSchema.safeParse({ kind: "task" }).success).toBe(false);
  });
});
