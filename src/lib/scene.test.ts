import { describe, expect, it } from "vite-plus/test";
import { parseCardChanges, parseCardInput } from "./card";
import {
  createDemoBoard,
  findOpenMemoryPosition,
  getMemoryBackground,
  getPrimaryTagAccent,
  getTopicBorder,
  getTopicTagColor,
  suggestMemoryPlacement,
} from "./scene";

describe("board", () => {
  it("colors cards from their primary tags", () => {
    expect(getMemoryBackground([])).toBe("#fff3bf");
    expect(getMemoryBackground(["web development"])).toBe("#d9e9ff");
    expect(getMemoryBackground(["job", "web development"])).toBe(
      "linear-gradient(135deg, #dff2d8, #d9e9ff)",
    );
    expect(getMemoryBackground(["unknown"])).toBe("#fff3bf");
    expect(getPrimaryTagAccent("web development")).toBe("#356fbd");
    expect(getPrimaryTagAccent("unknown")).toBe("var(--primary-color)");
  });

  it("colors card borders from their topic tags", () => {
    expect(getTopicBorder([])).toBe("var(--primary-color)");
    expect(getTopicBorder(["CSS"])).toBe("#b83280");
    expect(getTopicBorder(["Vue", "React"])).toBe("linear-gradient(135deg, #2f855a, #1677a8)");
    expect(getTopicBorder(["unknown"])).toBe("var(--primary-color)");
    expect(getTopicTagColor("finance")).toBe("#a66f00");
    expect(getTopicTagColor("unknown")).toBe("var(--theme-muted)");
  });

  it("provides a demo with diverse primary tag combinations", () => {
    const demo = createDemoBoard();

    expect(demo.nodes).toHaveLength(9);
    expect(demo.nodes.map((node) => node.data.tags)).toEqual(
      expect.arrayContaining([
        ["job"],
        ["personal development"],
        ["web development"],
        ["job", "web development"],
        ["job", "personal development"],
        ["web development", "personal development"],
        ["job", "web development", "personal development"],
      ]),
    );
  });

  it("suggests related memories and avoids occupied positions", () => {
    const nodes = createDemoBoard().nodes;
    const strong = suggestMemoryPlacement(nodes, {
      tags: ["Job"],
      topics: ["Vue", "React"],
    });
    const tied = suggestMemoryPlacement(nodes, { tags: ["Job"], topics: [] });

    expect(strong.automatic).toBe("demo-6");
    expect(tied.automatic).toBeNull();
    expect(tied.choices).toHaveLength(3);
    expect(findOpenMemoryPosition(nodes, { x: 0, y: 0 })).toEqual({ x: 720, y: 220 });
  });
});

describe("card writes", () => {
  const card = {
    id: "00000000-0000-4000-8000-000000000001",
    title: "  Capture  ",
    body: "Remember this",
    position: { x: 10, y: 20 },
    tags: ["Personal development"],
    topics: [],
    links: ["https://example.com"],
  };

  it("validates and normalizes database writes", () => {
    expect(parseCardInput(card)).toEqual({ ...card, title: "Capture" });
    expect(parseCardInput({ ...card, id: "starter-capture" })).toBeNull();
    expect(parseCardInput({ ...card, links: ["javascript:alert(1)"] })).toBeNull();
    expect(parseCardChanges({ position: { x: Number.NaN, y: 0 } })).toBeNull();
    expect(parseCardChanges({ title: " Updated " })).toEqual({ title: "Updated" });
  });
});
