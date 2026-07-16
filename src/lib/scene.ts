import type { Node } from "@xyflow/svelte";
import type { Card, CardInput } from "./card";
import { PRIMARY_TAGS, TOPIC_TAGS } from "./labels";

export { PRIMARY_TAGS, TOPIC_TAGS } from "./labels";
type PrimaryTagKey = Lowercase<(typeof PRIMARY_TAGS)[number]>;
type TopicTagKey = Lowercase<(typeof TOPIC_TAGS)[number]>;
export const PRIMARY_TAG_COLORS = {
  "web development": { background: "#d9e9ff", accent: "#356fbd" },
  job: { background: "#dff2d8", accent: "#3f7f36" },
  "personal development": { background: "#f2dff5", accent: "#8f4aa0" },
} satisfies Record<PrimaryTagKey, { background: string; accent: string }>;
export const TOPIC_TAG_COLORS = {
  "local-first": "#c65f15",
  css: "#b83280",
  hosting: "#5b5fc7",
  vue: "#2f855a",
  react: "#1677a8",
  finance: "#a66f00",
} satisfies Record<TopicTagKey, string>;

export type MemoryData = {
  title: string;
  body: string;
  tags: string[];
  topics: string[];
  links: string[];
  tagVocabulary: string[];
};
export type MemoryNode = Node<MemoryData, "memory">;
export type BoardSnapshot = { nodes: MemoryNode[] };
const demoCards = [
  {
    title: "Keep memories local-first",
    body: "Store each card in PostgreSQL and add sync only when it is useful.",
    tags: ["web development"],
    topics: ["local-first"],
  },
  {
    title: "Polish the card layout",
    body: "Use CSS to keep tags readable without crowding the memory itself.",
    tags: ["web development"],
    topics: ["CSS"],
  },
  {
    title: "Choose a hosting setup",
    body: "Compare a static deployment with a small serverless enrichment endpoint.",
    tags: ["job", "web development"],
    topics: ["hosting"],
  },
  {
    title: "Compare component patterns",
    body: "Save useful ideas from Vue and React without turning the board into framework notes.",
    tags: ["web development"],
    topics: ["Vue", "React"],
  },
  {
    title: "Review the monthly budget",
    body: "Capture what changed, what worked, and one adjustment for next month.",
    tags: ["personal development"],
    topics: ["finance"],
  },
  {
    title: "Plan the next release",
    body: "Choose a small milestone and write down what must be ready before it ships.",
    tags: ["job"],
    topics: ["hosting"],
  },
  {
    title: "Prepare for an interview",
    body: "Practice explaining frontend tradeoffs clearly instead of memorizing framework trivia.",
    tags: ["job", "personal development"],
    topics: ["Vue", "React"],
  },
  {
    title: "Build a budget dashboard",
    body: "Turn monthly finance notes into a small interface that makes patterns easier to see.",
    tags: ["web development", "personal development"],
    topics: ["finance", "React", "CSS"],
  },
  {
    title: "Publish the side project",
    body: "Use the memory board to learn, show the work, and test a simple deployment path.",
    tags: ["job", "web development", "personal development"],
    topics: ["local-first", "hosting", "Vue"],
  },
] satisfies Omit<MemoryData, "links" | "tagVocabulary">[];

const demoPositions = [
  { x: 0, y: 0 },
  { x: 360, y: 20 },
  { x: 960, y: 0 },
  { x: 180, y: 250 },
  { x: 500, y: 700 },
  { x: 1320, y: 30 },
  { x: 1140, y: 280 },
  { x: 860, y: 720 },
  { x: 680, y: 970 },
];

const demoBoard: BoardSnapshot = {
  nodes: demoCards.map((data, index) => ({
    id: `demo-${index}`,
    type: "memory",
    position: demoPositions[index],
    data: { ...data, links: [], tagVocabulary: [...PRIMARY_TAGS, ...TOPIC_TAGS] },
    focusable: true,
  })),
};

export function createDemoBoard(): BoardSnapshot {
  return structuredClone(demoBoard);
}

function getPrimaryTagColor(tag: string) {
  return PRIMARY_TAG_COLORS[tag.toLowerCase() as PrimaryTagKey];
}

function getTopicColor(topic: string) {
  return TOPIC_TAG_COLORS[topic.toLowerCase() as TopicTagKey];
}

export function getMemoryBackground(tags: string[]): string {
  const colors = tags.flatMap((tag) => {
    const color = getPrimaryTagColor(tag);
    return color ? [color.background] : [];
  });

  if (colors.length === 0) return "#fff3bf";
  return colors.length === 1 ? colors[0] : `linear-gradient(135deg, ${colors.join(", ")})`;
}

export function getPrimaryTagAccent(tag: string): string {
  return getPrimaryTagColor(tag)?.accent ?? "var(--primary-color)";
}

export function getTopicBorder(topics: string[]): string {
  const colors = topics.flatMap((topic) => {
    const color = getTopicColor(topic);
    return color ? [color] : [];
  });

  if (colors.length === 0) return "var(--primary-color)";
  return colors.length === 1 ? colors[0] : `linear-gradient(135deg, ${colors.join(", ")})`;
}

export function getTopicTagColor(topic: string): string {
  return getTopicColor(topic) ?? "var(--theme-muted)";
}

export function cardToMemoryNode(card: Card, tagVocabulary: string[] = []): MemoryNode {
  return {
    id: card.id,
    type: "memory",
    position: { ...card.position },
    data: {
      title: card.title,
      body: card.body,
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
