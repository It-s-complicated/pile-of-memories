import { describe, expect, it } from "vite-plus/test";
import {
  createDemoScene,
  createStarterScene,
  findOpenMemoryPosition,
  getMemoryBackground,
  getPrimaryTagAccent,
  getTopicBorder,
  getTopicTagColor,
  readScene,
  serializeScene,
  suggestMemoryPlacement,
} from "./scene";

describe("scene snapshots", () => {
  it("round-trips valid scenes and falls back for invalid data", () => {
    const scene = createStarterScene();

    expect(readScene(serializeScene(scene))).toEqual(scene);
    expect(readScene('{"nodes":"invalid"}')).toEqual(scene);
  });

  it("loads older saved memories without their connections", () => {
    const scene = readScene(
      JSON.stringify({
        nodes: [
          {
            id: "legacy",
            type: "memory",
            position: { x: 0, y: 0 },
            data: { title: "Older memory", body: "Saved before tags existed." },
          },
        ],
        edges: [{ id: "legacy-edge", source: "legacy", target: "legacy" }],
      }),
    );

    expect(scene.nodes[0]?.data).toEqual({
      title: "Older memory",
      body: "Saved before tags existed.",
      tags: [],
      topics: [],
    });
  });

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
    const demo = createDemoScene();

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
    const nodes = createDemoScene().nodes;
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
