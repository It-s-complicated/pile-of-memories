import type { Edge, Node } from "@xyflow/svelte";

export const SCENE_STORAGE_KEY = "pile-of-memories-scene";
export const DEFAULT_MEMORY_BODY = "Write the memory, then move it where it belongs.";
export const PRIMARY_TAGS = ["Web development", "Job", "Personal development"] as const;
export const TOPIC_TAGS = ["Local-first", "CSS", "Hosting", "Vue", "React", "Finance"] as const;
export const PRIMARY_TAG_COLORS = {
  "Web development": { background: "#d9e9ff", accent: "#356fbd" },
  Job: { background: "#dff2d8", accent: "#3f7f36" },
  "Personal development": { background: "#f2dff5", accent: "#8f4aa0" },
} satisfies Record<(typeof PRIMARY_TAGS)[number], { background: string; accent: string }>;
export const TOPIC_TAG_COLORS = {
  "Local-first": "#c65f15",
  CSS: "#b83280",
  Hosting: "#5b5fc7",
  Vue: "#2f855a",
  React: "#1677a8",
  Finance: "#6a994e",
} satisfies Record<(typeof TOPIC_TAGS)[number], string>;

export type MemoryData = { title: string; body: string; tags: string[]; topics: string[] };
export type MemoryNode = Node<MemoryData, "memory">;
export type SceneSnapshot = { nodes: MemoryNode[]; edges: Edge[] };
type StoredMemoryNode = Node<
  Omit<MemoryData, "tags" | "topics"> & { tags?: string[]; topics?: string[] },
  "memory"
>;
type StoredSceneSnapshot = { nodes: StoredMemoryNode[]; edges: Edge[] };

const starterTitles = ["Capture", "Arrange", "Connect", "Review"];
const starterScene: SceneSnapshot = {
  nodes: starterTitles.map((title, index) => ({
    id: `starter-${title.toLowerCase()}`,
    type: "memory",
    position: { x: (index % 2) * 380, y: Math.floor(index / 2) * 240 },
    data: { title, body: DEFAULT_MEMORY_BODY, tags: [], topics: [] },
    focusable: true,
  })),
  edges: [],
};

const demoCards = [
  {
    title: "Keep memories local-first",
    body: "Store the board in the browser now and add sync only when it is useful.",
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
    body: "Save useful ideas from Vue and React without turning the garden into framework notes.",
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
    body: "Use the memory garden to learn, show the work, and test a simple deployment path.",
    tags: ["job", "web development", "personal development"],
    topics: ["local-first", "hosting", "Vue"],
  },
] satisfies MemoryData[];

const demoScene: SceneSnapshot = {
  nodes: demoCards.map((data, index) => ({
    id: `demo-${index}`,
    type: "memory",
    position: { x: (index % 3) * 360, y: Math.floor(index / 3) * 250 },
    data,
    focusable: true,
  })),
  edges: [],
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object";
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isMemoryNode(value: unknown): value is StoredMemoryNode {
  if (!isRecord(value) || !isRecord(value.position) || !isRecord(value.data)) return false;

  return (
    typeof value.id === "string" &&
    value.type === "memory" &&
    typeof value.position.x === "number" &&
    Number.isFinite(value.position.x) &&
    typeof value.position.y === "number" &&
    Number.isFinite(value.position.y) &&
    typeof value.data.title === "string" &&
    typeof value.data.body === "string" &&
    (value.data.tags === undefined || isStringArray(value.data.tags)) &&
    (value.data.topics === undefined || isStringArray(value.data.topics))
  );
}

function isSceneSnapshot(value: unknown): value is StoredSceneSnapshot {
  if (!isRecord(value) || !Array.isArray(value.nodes) || !Array.isArray(value.edges)) return false;
  if (!value.nodes.every(isMemoryNode)) return false;

  const nodeIds = new Set(value.nodes.map((node) => node.id));
  return value.edges.every(
    (edge) =>
      isRecord(edge) &&
      typeof edge.id === "string" &&
      typeof edge.source === "string" &&
      typeof edge.target === "string" &&
      nodeIds.has(edge.source) &&
      nodeIds.has(edge.target),
  );
}

export function createStarterScene(): SceneSnapshot {
  return structuredClone(starterScene);
}

export function createDemoScene(): SceneSnapshot {
  return structuredClone(demoScene);
}

export function getMemoryBackground(tags: string[]): string {
  const colors = tags.flatMap((tag) =>
    tag in PRIMARY_TAG_COLORS
      ? [PRIMARY_TAG_COLORS[tag as keyof typeof PRIMARY_TAG_COLORS].background]
      : [],
  );

  if (colors.length === 0) return "#fff3bf";
  return colors.length === 1 ? colors[0] : `linear-gradient(135deg, ${colors.join(", ")})`;
}

export function getPrimaryTagAccent(tag: string): string {
  return tag in PRIMARY_TAG_COLORS
    ? PRIMARY_TAG_COLORS[tag as keyof typeof PRIMARY_TAG_COLORS].accent
    : "#5f4b32";
}

export function getTopicBorder(topics: string[]): string {
  const colors = topics.flatMap((topic) =>
    topic in TOPIC_TAG_COLORS ? [TOPIC_TAG_COLORS[topic as keyof typeof TOPIC_TAG_COLORS]] : [],
  );

  if (colors.length === 0) return "#5f4b32";
  return colors.length === 1 ? colors[0] : `linear-gradient(135deg, ${colors.join(", ")})`;
}

export function getTopicTagColor(topic: string): string {
  return topic in TOPIC_TAG_COLORS
    ? TOPIC_TAG_COLORS[topic as keyof typeof TOPIC_TAG_COLORS]
    : "#8a765e";
}

export function readScene(raw: string | null): SceneSnapshot {
  try {
    const scene: unknown = JSON.parse(raw ?? "");
    if (!isSceneSnapshot(scene)) return createStarterScene();

    return {
      nodes: scene.nodes.map((node) => ({
        ...node,
        data: { ...node.data, tags: node.data.tags ?? [], topics: node.data.topics ?? [] },
      })),
      edges: scene.edges,
    };
  } catch {
    return createStarterScene();
  }
}

export function serializeScene(scene: SceneSnapshot) {
  return JSON.stringify({
    nodes: scene.nodes.map(({ id, type, position, data, focusable }) => ({
      id,
      type,
      position,
      data,
      focusable,
    })),
    edges: scene.edges.map(({ id, source, target, sourceHandle, targetHandle }) => ({
      id,
      source,
      target,
      sourceHandle,
      targetHandle,
    })),
  });
}
