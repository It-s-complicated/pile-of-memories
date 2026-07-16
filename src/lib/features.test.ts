import { describe, expect, it } from "vite-plus/test";
import {
  CLUSTER_GAP,
  findClusterPosition,
  getClusterKey,
  jaccardSimilarity,
  reflowClusters,
  restorePositions,
  snapshotPositions,
} from "./cluster-layout";
import { enrichmentInputSchema, enrichmentOutputSchema, fallbackTitle } from "./enrichment";
import { canonicalizeLabels, partitionLabels } from "./labels";
import { parseMarkdown } from "./markdown";

const node = (id: string, tags: string[], topics: string[] = [], position = { x: 0, y: 0 }) => ({
  id,
  data: { tags, topics },
  position,
});

describe("Markdown", () => {
  it("parses GFM once and extracts ordered, unique HTTP links", () => {
    const parsed = parseMarkdown(`# Heading

**bold** _em_ ~~strike~~

- [x] done
- item

> quote

\`code\`

[first](https://example.com) https://example.org [again](https://example.com)

<script>alert(1)</script> [unsafe](javascript:alert(1))`);

    expect(parsed.tokens.map(({ type }) => type)).toEqual(
      expect.arrayContaining(["heading", "paragraph", "list", "blockquote", "html"]),
    );
    expect(parsed.links).toEqual(["https://example.com", "https://example.org"]);
  });

  it("removes links when they disappear from the document", () => {
    expect(parseMarkdown("https://example.com").links).toHaveLength(1);
    expect(parseMarkdown("plain text").links).toEqual([]);
  });
});

describe("labels", () => {
  it("deduplicates case-insensitively and partitions known areas", () => {
    expect(canonicalizeLabels([" CSS ", "css", "job", "New topic"])).toEqual([
      "CSS",
      "Job",
      "New topic",
    ]);
    expect(partitionLabels(["css", "JOB", "new topic"])).toEqual({
      tags: ["Job"],
      topics: ["css", "new topic"],
    });
  });
});

describe("cluster placement", () => {
  it("normalizes exact keys and compares combinations with Jaccard similarity", () => {
    expect(getClusterKey({ tags: ["B", "a"], topics: ["A"] })).toBe("a\u001fb");
    expect(jaccardSimilarity("a\u001fb", "a\u001fc")).toBe(1 / 3);
    expect(jaccardSimilarity("a", "b")).toBe(0);
  });

  it("adds to exact clusters without collisions and keeps new clusters 640px away", () => {
    const existing = [node("a", ["A"])];
    expect(findClusterPosition(existing, { tags: ["a"], topics: [] }, { x: 20, y: 20 })).toEqual({
      x: 360,
      y: 0,
    });
    const related = findClusterPosition(existing, { tags: ["A", "B"], topics: [] }, { x: 0, y: 0 });
    expect(related.x).toBe(320 + CLUSTER_GAP);
    expect(
      findClusterPosition(
        [...existing, node("b", ["B"], [], { x: 500, y: 0 })],
        { tags: ["A"], topics: [] },
        { x: 0, y: 0 },
      ),
    ).toEqual({ x: 360, y: 1040 });
  });

  it("reflows deterministically into three-column clusters and restores previews", () => {
    const nodes = [
      node("d", ["A"], [], { x: 9, y: 9 }),
      node("b", ["A"]),
      node("a", ["A"]),
      node("c", ["A"]),
      node("e", ["B"]),
    ];
    const snapshot = snapshotPositions(nodes);
    const reflowed = reflowClusters(nodes);
    const positions = Object.fromEntries(reflowed.map(({ id, position }) => [id, position]));

    expect(positions).toMatchObject({
      a: { x: 0, y: 0 },
      b: { x: 360, y: 0 },
      c: { x: 720, y: 0 },
      d: { x: 0, y: 260 },
      e: { x: 1680, y: 0 },
    });
    expect(restorePositions(reflowed, snapshot).map(({ position }) => position)).toEqual(
      nodes.map(({ position }) => position),
    );
  });
});

describe("AI contracts", () => {
  it("validates inputs and deduplicates provider output", () => {
    expect(
      enrichmentInputSchema.parse({ description: "  Memory  ", existingTags: ["CSS", "css"] }),
    ).toEqual({ description: "Memory", existingTags: ["CSS"] });
    expect(enrichmentInputSchema.safeParse({ description: "", existingTags: [] }).success).toBe(
      false,
    );
    expect(enrichmentOutputSchema.parse({ title: " Title ", tags: ["CSS", "css"] })).toEqual({
      title: "Title",
      tags: ["CSS"],
    });
  });

  it("builds a fallback title without losing the description", () => {
    const description = `\n\n${"A".repeat(100)}\nsecond line`;
    expect(fallbackTitle(description)).toBe("A".repeat(80));
    expect(description).toContain("second line");
  });
});
