import { describe, expect, it } from "vite-plus/test";
import { parseCardChanges, parseCardInput } from "./card";
import { getMinimapColors, getPrimaryTagAccent, getTopicTagColor } from "./scene";

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
    links: [],
    archived: false,
  };

  it("normalizes labels and derives links from the body", () => {
    expect(parseCardInput(card)).toMatchObject({
      title: "Capture",
      tags: ["Personal development"],
      topics: ["CSS"],
      links: ["https://example.com", "https://example.org"],
    });
    expect(parseCardInput({ ...card, links: ["javascript:alert(1)"] })).toBeNull();
    expect(parseCardChanges({ body: "No links", links: ["https://example.com"] })).toEqual({
      body: "No links",
      links: [],
    });
    expect(parseCardChanges({ links: [] })).toBeNull();
  });

  it("rejects invalid IDs, positions, and partial label updates", () => {
    expect(parseCardInput({ ...card, id: "starter-capture" })).toBeNull();
    expect(parseCardChanges({ position: { x: Number.NaN, y: 0 } })).toBeNull();
    expect(parseCardChanges({ tags: ["Job"] })).toBeNull();
    expect(parseCardChanges({ archived: true })).toEqual({ archived: true });
    expect(parseCardChanges({ archived: "yes" })).toBeNull();
  });
});
