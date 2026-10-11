import { expect, it } from "vite-plus/test";
import { readFileSync } from "node:fs";
import { labelDefinitionSchema } from "../labels";
import { selectMemoryLabels } from "./label-selection";

// Read the actual seed definitions rather than maintaining a second hardcoded vocabulary.
const migration = readFileSync(
  new URL("../../../migrations/0006_managed_labels.sql", import.meta.url),
  "utf8",
);
const vocabulary = Array.from(
  migration.matchAll(/\('([^']+)', '(tag|topic)', '((?:[^']|'')*)'\)/g),
  (match, index) =>
    labelDefinitionSchema.parse({
      id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
      name: match[1],
      kind: match[2],
      description: match[3]!.replaceAll("''", "'"),
    }),
);
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
    name: "professional mindset and curiosity",
    description:
      "Product engineers build for other people and bring their own opinions. They are more than ticket workers. Curiosity matters: ask questions and stay open to learning.",
    kind: "note",
    required: ["Job", "Personal development"],
    allowed: ["Job", "Personal development"],
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
      { description },
      existingTags,
      AbortSignal.timeout(10_000),
    );
    const selected = [...result.tags, ...result.topics];
    expect
      .soft(
        result.tags.every((name) =>
          existingTags.some((label) => label.name === name && label.kind === "tag"),
        ),
      )
      .toBe(true);
    expect
      .soft(
        result.topics.every((name) =>
          existingTags.some((label) => label.name === name && label.kind === "topic"),
        ),
      )
      .toBe(true);
    expect.soft(result.kind).toBe(kind);
    expect.soft(selected, "Missing required labels").toEqual(expect.arrayContaining(required));
    expect
      .soft(
        selected.filter((tag) => !allowed.includes(tag)),
        "Unexpected labels",
      )
      .toEqual([]);
  },
  15_000,
);
