import { describe, expect, it } from "vite-plus/test";
import { parseCardChanges, parseCardInput } from "./card";
import {
  createDemoBoard,
  getMemoryBackground,
  getPrimaryTagAccent,
  getTopicBorder,
  getTopicTagColor,
} from "./scene";

describe("board", () => {
  it("colors cards from their area and topic tags", () => {
    expect(getMemoryBackground([])).toBe("#fff3bf");
    expect(getMemoryBackground(["web development"])).toBe("#d9e9ff");
    expect(getMemoryBackground(["job", "web development"])).toBe(
      "linear-gradient(135deg, #dff2d8, #d9e9ff)",
    );
    expect(getPrimaryTagAccent("unknown")).toBe("var(--primary-color)");
    expect(getTopicBorder(["Vue", "React"])).toBe("linear-gradient(135deg, #2f855a, #1677a8)");
    expect(getTopicTagColor("unknown")).toBe("var(--theme-muted)");
  });

  it("provides a demo with diverse area combinations", () => {
    const demo = createDemoBoard();
    expect(demo.nodes).toHaveLength(9);
    expect(demo.nodes.map((node) => node.data.tags)).toContainEqual([
      "job",
      "web development",
      "personal development",
    ]);
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
