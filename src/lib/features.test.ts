import { describe, expect, it } from "vite-plus/test";
import {
  findClusterPosition,
  reflowClusters,
  DEFAULT_CARD_SIZE,
  CLUSTER_GAP,
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
  it("packs uneven groups and mixed card heights without large empty rows", () => {
    const cards = Array.from({ length: 34 }, (_, index) => ({
      ...node(
        String(index).padStart(2, "0"),
        ["Job"],
        [index < 22 ? "AI" : ["CSS", "Agile", "Hosting"][Math.floor((index - 22) / 4)]],
      ),
      measured: { width: 320, height: 180 + (index % 5) * 60 },
    }));
    const arranged = reflowClusters(cards);
    const width = Math.max(...arranged.map((card) => card.position.x + card.measured.width));
    const height = Math.max(...arranged.map((card) => card.position.y + card.measured.height));
    const cardArea = cards.reduce(
      (area, card) => area + card.measured.width * card.measured.height,
      0,
    );
    expect(width * height).toBeLessThan(cardArea * 2.5);
    for (const [index, a] of arranged.entries()) {
      for (const b of arranged.slice(index + 1)) {
        expect(
          a.position.x + a.measured.width <= b.position.x ||
            b.position.x + b.measured.width <= a.position.x ||
            a.position.y + a.measured.height <= b.position.y ||
            b.position.y + b.measured.height <= a.position.y,
        ).toBe(true);
      }
    }
  });

  it("keeps a 34-card board in separated topic groups despite a shared category and bridge card", () => {
    const topics = ["AI", "CSS", "Agile"];
    const cards = Array.from({ length: 33 }, (_, index) => ({
      ...node(String(index).padStart(2, "0"), ["Job"], [topics[index % 3]]),
      measured: { width: 320, height: 180 + (index % 5) * 40 },
    }));
    const arranged = reflowClusters([
      ...cards,
      {
        ...node("bridge", ["Job"], topics),
        measured: { width: 320, height: 220 },
      },
    ]);
    const bounds = topics.map((topic) => {
      const members = arranged.filter(
        (card) => card.data.topics.length === 1 && card.data.topics[0] === topic,
      );
      return {
        left: Math.min(...members.map((card) => card.position.x)),
        top: Math.min(...members.map((card) => card.position.y)),
        right: Math.max(...members.map((card) => card.position.x + card.measured.width)),
        bottom: Math.max(...members.map((card) => card.position.y + card.measured.height)),
      };
    });
    for (let i = 0; i < bounds.length; i += 1) {
      for (let j = i + 1; j < bounds.length; j += 1) {
        const a = bounds[i],
          b = bounds[j];
        expect(
          Math.max(b.left - a.right, a.left - b.right, b.top - a.bottom, a.top - b.bottom),
        ).toBeGreaterThanOrEqual(CLUSTER_GAP);
      }
    }
  });

  it("places new cards near shared topics across category boundaries", () => {
    const existing = [
      node("category", ["Project"], ["CSS"]),
      node("topic", ["Job"], ["AI"], { x: 3000, y: 0 }),
    ];
    const position = findClusterPosition(
      existing,
      { tags: ["Project"], topics: ["AI"] },
      { x: 0, y: 0 },
    );
    expect(Math.abs(position.x - 3000)).toBeLessThan(600);
    expect(
      findClusterPosition(
        existing.toReversed(),
        { tags: [" project "], topics: ["ai", "AI"] },
        { x: 0, y: 0 },
      ),
    ).toEqual(position);
    expect(findClusterPosition(existing, { tags: [], topics: [] }, { x: 6000, y: 0 })).toEqual({
      x: 6000,
      y: 0,
    });
  });

  it("uses all labels and brings shared topics closer than shared categories", () => {
    const nodes = [
      node("a", ["Project"], ["AI"]),
      node("b", ["Job"], ["AI"]),
      node("c", ["Project"], ["CSS"]),
      node("d", ["Job"], ["CSS"]),
    ];
    const arranged = reflowClusters(nodes);
    const distance = (a: number, b: number) =>
      Math.hypot(
        arranged[a].position.x - arranged[b].position.x,
        arranged[a].position.y - arranged[b].position.y,
      );
    expect(distance(0, 1)).toBeLessThan(distance(0, 2));
    expect(distance(2, 3)).toBeLessThan(distance(1, 3));

    const pairDistance = (tags: string[], topics: string[]) => {
      const [a, b] = reflowClusters([
        node("a", ["Job", "Project"], ["AI"]),
        node("b", tags, topics),
      ]);
      return Math.hypot(a.position.x - b.position.x, a.position.y - b.position.y);
    };
    expect(pairDistance(["Project"], [])).toBeLessThan(pairDistance(["Unrelated"], []));
    expect(pairDistance(["Job", "Project"], ["AI"])).toBeLessThan(pairDistance(["Project"], []));
    expect(pairDistance([" project ", "JOB", "Job"], ["ai"])).toBe(
      pairDistance(["Job", "Project"], ["AI"]),
    );
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

  it("reflows measured cards deterministically without overlaps", () => {
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
    expect(reflowClusters([])).toEqual([]);
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
    expect(
      enrichmentOutputSchema.parse({ kind: "note", title: " Title ", tags: ["CSS", "css"] }),
    ).toEqual({
      kind: "note",
      title: "Title",
      tags: ["CSS"],
    });
  });

  it("validates correlated enrichment responses", () => {
    const attemptId = "00000000-0000-4000-8000-000000000001";
    expect(
      enrichmentResponseSchema.parse({ kind: "idea", attemptId, title: "Title", tags: ["CSS"] }),
    ).toEqual({
      kind: "idea",
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
