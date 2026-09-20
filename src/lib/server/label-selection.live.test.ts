import { expect, it } from "vite-plus/test";
import { PRIMARY_TAGS, TOPIC_TAGS } from "../labels";
import { selectMemoryLabels } from "./label-selection";

// Opt in with truthy TEST_LIVE_ENRICHMENT; uses the configured provider and synthetic text only.
it.skipIf(!process.env.TEST_LIVE_ENRICHMENT)(
  "suggests relevant labels for short notes without forcing unrelated labels",
  async () => {
    const examples = [
      {
        description: "Compare language models for summarizing research papers.",
        expected: ["AI"],
      },
      {
        description:
          "I am building a personal website with Vue and CSS grid. I want to deploy it to a hosting provider.",
        expected: ["Web development", "CSS", "Hosting", "Vue", "Project"],
      },
      {
        description: "I baked a chocolate cake for my sister’s birthday.",
        expected: [],
      },
    ];

    for (const { description, expected } of examples) {
      const { tags } = await selectMemoryLabels(
        { description, existingTags: [...PRIMARY_TAGS, ...TOPIC_TAGS] },
        AbortSignal.timeout(10_000),
      );
      if (expected.length) {
        expect(tags.some((tag) => expected.includes(tag))).toBe(true);
      } else {
        expect(tags).toEqual([]);
      }
    }
  },
  35_000,
);
