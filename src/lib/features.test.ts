import { describe, expect, it } from "vite-plus/test";
import {
  findClusterPosition,
  getClusterKey,
  getClusterRegions,
  reflowClusters,
  CLUSTER_GAP,
  DEFAULT_CARD_SIZE,
} from "./cluster-layout";
import {
  enrichmentInputSchema,
  enrichmentOutputSchema,
  enrichmentResponseSchema,
  fallbackTitle,
} from "./enrichment";
import {
  cardCreationProvenanceSchema,
  compareTagFingerprints,
  normalizeAnalyticsTags,
  ratioOrNull,
} from "./enrichment-analytics";
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
    expect(partitionLabels(["css", "JOB", "project", "new topic"])).toEqual({
      tags: ["Job", "Project"],
      topics: ["css", "new topic"],
    });
  });
});

describe("cluster placement", () => {
  it("uses a stable category regardless of topic additions and label order", () => {
    expect(getClusterKey({ tags: ["Project"], topics: ["AI"] })).toBe("project");
    expect(getClusterKey({ tags: [" project "], topics: ["AI", "Hosting"] })).toBe("project");
    expect(getClusterKey({ tags: ["B", "a"], topics: [] })).toBe("a");
    expect(getClusterKey({ tags: ["a", "B"], topics: [] })).toBe("a");
    expect(getClusterKey({ tags: [], topics: ["CSS"] })).toBe("css");
    expect(getClusterKey({ tags: [], topics: [] })).toBe("");
  });

  it("places a new card without moving or overlapping existing cards", () => {
    const existing = [
      { ...node("a", ["Project"]), measured: { width: 320, height: 500 } },
      node("b", ["Job"], [], { x: 344, y: 0 }),
    ];
    const before = structuredClone(existing);
    const position = findClusterPosition(
      existing,
      { tags: ["Project"], topics: ["AI"] },
      { x: 0, y: 0 },
    );
    expect(existing).toEqual(before);
    for (const other of existing) {
      const height = "measured" in other ? other.measured.height : DEFAULT_CARD_SIZE.height;
      expect(
        position.x + 320 <= other.position.x ||
          other.position.x + 320 <= position.x ||
          position.y + 220 <= other.position.y ||
          other.position.y + height <= position.y,
      ).toBe(true);
    }
    expect(findClusterPosition([], { tags: [], topics: [] }, { x: 12, y: 34 })).toEqual({
      x: 12,
      y: 34,
    });
  });

  it("reflows measured cards deterministically with distinct category boundaries", () => {
    const nodes = Array.from({ length: 15 }, (_, index) => ({
      ...node(
        String(index).padStart(2, "0"),
        [index < 9 ? "Project" : "Job"],
        [index % 2 ? "AI" : "Hosting"],
      ),
      measured: { width: 320 + index * 3, height: 180 + index * 47 },
    }));
    const before = structuredClone(nodes);
    const arranged = reflowClusters(nodes);
    expect(nodes).toEqual(before);
    const positions = (items: typeof arranged) =>
      Object.fromEntries(items.map(({ id, position }) => [id, position]));
    expect(positions(reflowClusters(nodes.toReversed()))).toEqual(positions(arranged));
    expect(positions(reflowClusters(arranged))).toEqual(positions(arranged));

    for (const [index, left] of arranged.entries()) {
      for (const right of arranged.slice(index + 1)) {
        expect(
          left.position.x + left.measured.width <= right.position.x ||
            right.position.x + right.measured.width <= left.position.x ||
            left.position.y + left.measured.height <= right.position.y ||
            right.position.y + right.measured.height <= left.position.y,
        ).toBe(true);
      }
    }
    const regions = getClusterRegions(arranged);
    expect(regions.map(({ name, count }) => ({ name, count }))).toEqual([
      { name: "Job", count: 6 },
      { name: "Project", count: 9 },
    ]);
    const [left, right] = regions;
    expect(
      Math.max(
        right.x - left.x - left.width,
        left.x - right.x - right.width,
        right.y - left.y - left.height,
        left.y - right.y - right.height,
      ),
    ).toBeGreaterThanOrEqual(CLUSTER_GAP - 76);
    const project = arranged.filter(({ data }) => data.tags.includes("Project"));
    expect(new Set(project.map(({ position }) => position.x)).size).toBeGreaterThan(3);
    expect(new Set(project.map(({ position }) => position.y)).size).toBeGreaterThan(3);
    for (const item of arranged) {
      const region = regions.find(({ key }) => key === getClusterKey(item.data))!;
      expect(item.position.x).toBeGreaterThan(region.x);
      expect(item.position.y).toBeGreaterThan(region.y);
      expect(item.position.x + item.measured.width).toBeLessThan(region.x + region.width);
      expect(item.position.y + item.measured.height).toBeLessThan(region.y + region.height);
    }
    expect(reflowClusters([])).toEqual([]);
    expect(getClusterRegions([])).toEqual([]);
    expect(getClusterRegions([node("inbox", [])])[0].name).toBe("Inbox");
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

  it("validates correlated enrichment responses", () => {
    const attemptId = "00000000-0000-4000-8000-000000000001";
    expect(enrichmentResponseSchema.parse({ attemptId, title: "Title", tags: ["CSS"] })).toEqual({
      attemptId,
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

describe("enrichment analytics", () => {
  it("canonicalizes tag comparisons and reports empty ratios as null", () => {
    expect(normalizeAnalyticsTags([" CSS ", "css", "Job"])).toEqual(["css", "job"]);
    expect(compareTagFingerprints(["css", "job"], ["css", "new"])).toEqual({
      generatedTagCount: 2,
      finalTagCount: 2,
      retainedTagCount: 1,
      removedTagCount: 1,
      addedTagCount: 1,
      generatedTagAcceptance: 0.5,
      finalTagCoverage: 0.5,
    });
    expect(ratioOrNull(0, 0)).toBeNull();
    expect(compareTagFingerprints([], []).generatedTagAcceptance).toBeNull();
  });

  it("validates bounded creation provenance", () => {
    const valid = {
      enrichmentAttemptId: "00000000-0000-4000-8000-000000000001",
      resultSource: "cache",
      reviewStartedAt: "2026-01-01T12:00:00.000Z",
    };
    expect(cardCreationProvenanceSchema.parse(valid)).toEqual(valid);
    expect(
      cardCreationProvenanceSchema.safeParse({ ...valid, resultSource: "manual" }).success,
    ).toBe(false);
    expect(
      cardCreationProvenanceSchema.safeParse({ ...valid, privateTitle: "secret" }).success,
    ).toBe(false);
  });
});
