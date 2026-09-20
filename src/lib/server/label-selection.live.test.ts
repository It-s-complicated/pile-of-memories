import { expect, it } from "vite-plus/test";
import { PRIMARY_TAGS, TOPIC_TAGS } from "../labels";
import { selectMemoryLabels } from "./label-selection";

const vocabulary = [...PRIMARY_TAGS, ...TOPIC_TAGS];
const examples = [
  {
    name: "AI reference note",
    description:
      "Reference: language models can summarize research papers and extract key findings.",
    kind: "note",
    required: ["AI"],
    allowed: ["AI"],
    existingTags: vocabulary,
  },
  {
    name: "multiple web development topics",
    description:
      "Project notes: my personal website uses Vue components and CSS grid layouts. Deployment requires choosing a web hosting provider.",
    kind: "note",
    required: ["Web development", "Vue", "CSS", "Hosting"],
    allowed: ["Web development", "Vue", "CSS", "Hosting", "Project"],
    existingTags: vocabulary,
  },
  {
    name: "proposed local-first project",
    description:
      "Idea: build a local-first notebook app that stores every note on the device and works offline. This could be my next project.",
    kind: "idea",
    required: ["Local-first", "Project"],
    allowed: ["Local-first", "Project"],
    existingTags: vocabulary,
  },
  {
    name: "personal recollection without matching labels",
    description:
      "I baked a chocolate cake for my sister’s birthday yesterday. We laughed when the candles fell over, and I will treasure that evening together.",
    kind: "memory",
    required: [],
    allowed: [],
    existingTags: vocabulary,
  },
  {
    name: "unrelated reference note",
    description: "Recipe: bake the chocolate cake at 180 degrees for 30 minutes, then let it cool.",
    kind: "note",
    required: [],
    allowed: [],
    existingTags: vocabulary,
  },
  {
    name: "passing mention does not become a topic",
    description:
      "Yesterday I reunited with my sister after years apart. Someone briefly mentioned CSS, but what I remember is her hug and our long walk by the river.",
    kind: "memory",
    required: [],
    allowed: [],
    existingTags: vocabulary,
  },
  {
    name: "classification without a vocabulary",
    description: "Idea: invent a self-watering flowerpot that collects rainwater from the balcony.",
    kind: "idea",
    required: [],
    allowed: [],
    existingTags: [],
  },
];

// Opt in: TEST_LIVE_ENRICHMENT=1 vp test src/lib/server/label-selection.live.test.ts
// Uses the configured provider and synthetic text only. Label order is not part of quality.
it.runIf(process.env.TEST_LIVE_ENRICHMENT === "1").each(examples)(
  "$name",
  async ({ description, kind, required, allowed, existingTags }) => {
    const result = await selectMemoryLabels(
      { description, existingTags },
      AbortSignal.timeout(10_000),
    );
    expect.soft(result.kind).toBe(kind);
    expect.soft(result.tags, "Missing required labels").toEqual(expect.arrayContaining(required));
    expect
      .soft(
        result.tags.filter((tag) => !allowed.includes(tag)),
        "Unexpected labels",
      )
      .toEqual([]);
  },
  15_000,
);
