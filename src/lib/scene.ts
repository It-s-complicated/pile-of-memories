import type { Node } from "@xyflow/svelte";
import type { Card, CardInput } from "./card";

export const DEFAULT_MEMORY_BODY = "Write the memory, then move it where it belongs.";
export const PRIMARY_TAGS = ["Web development", "Job", "Personal development"] as const;
export const TOPIC_TAGS = ["Local-first", "CSS", "Hosting", "Vue", "React", "Finance"] as const;
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
};
export type MemoryNode = Node<MemoryData, "memory">;
export type BoardSnapshot = { nodes: MemoryNode[] };
export type PlacementSuggestion = {
  automatic: string | null;
  choices: { id: string; title: string }[];
};
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
] satisfies Omit<MemoryData, "links">[];

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
    data: { ...data, links: [] },
    focusable: true,
  })),
};

export function createDemoBoard(): BoardSnapshot {
  return structuredClone(demoBoard);
}

export function suggestMemoryPlacement(
  nodes: MemoryNode[],
  data: Pick<MemoryData, "tags" | "topics">,
): PlacementSuggestion {
  const selected = new Set([...data.tags, ...data.topics].map((value) => value.toLowerCase()));
  const matches = nodes
    .map((node) => ({
      id: node.id,
      title: node.data.title || "Untitled memory",
      score: [...node.data.tags, ...node.data.topics].filter((value) =>
        selected.has(value.toLowerCase()),
      ).length,
    }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score);
  const best = matches[0];
  const automatic =
    best && best.score >= 2 && best.score > (matches[1]?.score ?? 0) ? best.id : null;

  return {
    automatic,
    choices: matches.slice(0, 3).map(({ id, title }) => ({ id, title })),
  };
}

export function findOpenMemoryPosition(
  nodes: MemoryNode[],
  origin: { x: number; y: number },
): { x: number; y: number } {
  let attempt = 0;

  // ponytail: a small grid scan suits local boards; use spatial indexing if large boards become slow.
  while (true) {
    const position = {
      x: origin.x + (attempt % 3) * 360,
      y: origin.y + Math.floor(attempt / 3) * 220,
    };
    const occupied = nodes.some(
      (node) =>
        Math.abs(node.position.x - position.x) < 360 &&
        Math.abs(node.position.y - position.y) < 220,
    );

    if (!occupied) return position;
    attempt += 1;
  }
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

export function cardToMemoryNode(card: Card): MemoryNode {
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
  };
}
