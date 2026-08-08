import type { Node } from "@xyflow/svelte";
import type { Card, CardInput } from "./card";
import { PRIMARY_TAGS, TOPIC_TAGS } from "./labels";

export { PRIMARY_TAGS, TOPIC_TAGS } from "./labels";
type PrimaryTagKey = Lowercase<(typeof PRIMARY_TAGS)[number]>;
type TopicTagKey = Lowercase<(typeof TOPIC_TAGS)[number]>;

// Tag colors form one OKLCH family: fixed lightness and chroma, hue per tag,
// so every tag is scannable while the whole pile sits calm.
const PRIMARY_TAG_HUES = {
  "web development": 255,
  job: 145,
  "personal development": 305,
  project: 354,
} satisfies Record<PrimaryTagKey, number>;
const TOPIC_TAG_HUES = {
  ai: 195,
  "local-first": 50,
  css: 335,
  hosting: 270,
  vue: 160,
  react: 225,
  finance: 85,
} satisfies Record<TopicTagKey, number>;

export type MemoryData = {
  title: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  tags: string[];
  topics: string[];
  links: string[];
  tagVocabulary: string[];
};
export type MemoryNode = Node<MemoryData, "memory">;
function getPrimaryTagHue(tag: string): number | undefined {
  return PRIMARY_TAG_HUES[tag.toLowerCase() as PrimaryTagKey];
}

function getTopicHue(topic: string): number | undefined {
  return TOPIC_TAG_HUES[topic.toLowerCase() as TopicTagKey];
}

/** Filled-label color for a primary tag (paper text on top). */
export function getPrimaryTagAccent(tag: string): string {
  const hue = getPrimaryTagHue(tag);
  return hue === undefined ? "var(--theme-ink)" : `oklch(0.46 0.09 ${hue})`;
}

/** Outline and text color for a topic tag. */
export function getTopicTagColor(topic: string): string {
  const hue = getTopicHue(topic);
  return hue === undefined ? "var(--muted)" : `oklch(0.44 0.08 ${hue})`;
}

/** Drawer-index colors for the minimap: one segment per known primary tag. */
export function getMinimapColors(tags: string[]): string[] {
  const colors = tags.flatMap((tag) => {
    const hue = getPrimaryTagHue(tag);
    return hue === undefined ? [] : [`oklch(0.62 0.1 ${hue})`];
  });
  return colors.length > 0 ? colors : ["color-mix(in oklch, var(--muted) 45%, var(--paper))"];
}

export function cardToMemoryNode(card: Card, tagVocabulary: string[] = []): MemoryNode {
  return {
    id: card.id,
    type: "memory",
    position: { ...card.position },
    data: {
      title: card.title,
      body: card.body,
      createdAt: card.createdAt,
      updatedAt: card.updatedAt,
      tags: card.tags,
      topics: card.topics,
      links: card.links,
      tagVocabulary,
    },
    focusable: true,
  };
}

export function memoryNodeToCard(node: MemoryNode): CardInput {
  return {
    id: node.id,
    title: node.data.title.trim() || "Untitled memory",
    body: node.data.body,
    position: node.position,
    tags: node.data.tags,
    topics: node.data.topics,
    links: node.data.links,
    archived: false,
  };
}
