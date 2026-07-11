import type { Edge, Node } from "@xyflow/svelte";

export const SCENE_STORAGE_KEY = "pile-of-memories-scene";
export const DEFAULT_MEMORY_BODY = "Write the memory, then move it where it belongs.";

export type MemoryData = { title: string; body: string };
export type MemoryNode = Node<MemoryData, "memory">;
export type SceneSnapshot = { nodes: MemoryNode[]; edges: Edge[] };

const starterTitles = ["Capture", "Arrange", "Connect", "Review"];
const starterScene: SceneSnapshot = {
  nodes: starterTitles.map((title, index) => ({
    id: `starter-${title.toLowerCase()}`,
    type: "memory",
    position: { x: (index % 2) * 380, y: Math.floor(index / 2) * 240 },
    data: { title, body: DEFAULT_MEMORY_BODY },
    focusable: true,
  })),
  edges: [],
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object";
}

function isMemoryNode(value: unknown): value is MemoryNode {
  if (!isRecord(value) || !isRecord(value.position) || !isRecord(value.data)) return false;

  return (
    typeof value.id === "string" &&
    value.type === "memory" &&
    typeof value.position.x === "number" &&
    Number.isFinite(value.position.x) &&
    typeof value.position.y === "number" &&
    Number.isFinite(value.position.y) &&
    typeof value.data.title === "string" &&
    typeof value.data.body === "string"
  );
}

function isSceneSnapshot(value: unknown): value is SceneSnapshot {
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

export function readScene(raw: string | null): SceneSnapshot {
  try {
    const scene: unknown = JSON.parse(raw ?? "");
    return isSceneSnapshot(scene) ? scene : createStarterScene();
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
