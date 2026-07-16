export const CLUSTER_GAP = 640;
export const CARD_GAP = 40;
export const DEFAULT_CARD_SIZE = { width: 320, height: 220 };
const REFLOW_SHELF_WIDTH = 4_000;

type ClusterNode = {
  id: string;
  position: { x: number; y: number };
  data: { tags: string[]; topics: string[] };
  width?: number;
  height?: number;
  measured?: { width?: number; height?: number };
};

type Rect = { minX: number; minY: number; maxX: number; maxY: number };

function normalizedLabels(data: ClusterNode["data"]): string[] {
  return [data.tags, data.topics]
    .flat()
    .map((label) => label.trim().toLowerCase())
    .filter(Boolean)
    .filter((label, index, labels) => labels.indexOf(label) === index)
    .sort();
}

export function getClusterKey(data: ClusterNode["data"]): string {
  return normalizedLabels(data).join("\u001f");
}

export function jaccardSimilarity(left: string, right: string): number {
  const a = new Set(left ? left.split("\u001f") : []);
  const b = new Set(right ? right.split("\u001f") : []);
  const union = new Set([...a, ...b]);
  if (union.size === 0) return 1;
  return [...a].filter((label) => b.has(label)).length / union.size;
}

function size(node?: ClusterNode): { width: number; height: number } {
  return {
    width: node?.measured?.width ?? node?.width ?? DEFAULT_CARD_SIZE.width,
    height: node?.measured?.height ?? node?.height ?? DEFAULT_CARD_SIZE.height,
  };
}

function nodeRect(node: ClusterNode): Rect {
  const { width, height } = size(node);
  return {
    minX: node.position.x,
    minY: node.position.y,
    maxX: node.position.x + width,
    maxY: node.position.y + height,
  };
}

function positionRect(position: { x: number; y: number }): Rect {
  return {
    minX: position.x,
    minY: position.y,
    maxX: position.x + DEFAULT_CARD_SIZE.width,
    maxY: position.y + DEFAULT_CARD_SIZE.height,
  };
}

function bounds(nodes: ClusterNode[]): Rect {
  const rects = nodes.map(nodeRect);
  return {
    minX: Math.min(...rects.map((rect) => rect.minX)),
    minY: Math.min(...rects.map((rect) => rect.minY)),
    maxX: Math.max(...rects.map((rect) => rect.maxX)),
    maxY: Math.max(...rects.map((rect) => rect.maxY)),
  };
}

function overlaps(left: Rect, right: Rect, gap = 0): boolean {
  return !(
    left.maxX + gap <= right.minX ||
    right.maxX + gap <= left.minX ||
    left.maxY + gap <= right.minY ||
    right.maxY + gap <= left.minY
  );
}

function clusters(nodes: ClusterNode[]): Map<string, ClusterNode[]> {
  const result = new Map<string, ClusterNode[]>();
  for (const node of nodes) {
    const key = getClusterKey(node.data);
    result.set(key, [...(result.get(key) ?? []), node]);
  }
  return result;
}

export function findClusterPosition(
  nodes: ClusterNode[],
  data: ClusterNode["data"],
  fallback: { x: number; y: number },
): { x: number; y: number } {
  if (nodes.length === 0) return fallback;

  const grouped = clusters(nodes);
  const key = getClusterKey(data);
  const exact = grouped.get(key);
  const otherBounds = [...grouped]
    .filter(([clusterKey]) => clusterKey !== key)
    .map(([, clusterNodes]) => bounds(clusterNodes));
  const cardSize = size();

  if (exact) {
    const exactBounds = bounds(exact);
    for (let attempt = 0; ; attempt += 1) {
      const candidate = {
        x: exactBounds.maxX + CARD_GAP + (attempt % 3) * (cardSize.width + CARD_GAP),
        y: exactBounds.minY + Math.floor(attempt / 3) * (cardSize.height + CARD_GAP),
      };
      const rect = positionRect(candidate);
      if (
        !nodes.some((node) => overlaps(nodeRect(node), positionRect(candidate))) &&
        !otherBounds.some((other) => overlaps(rect, other, CLUSTER_GAP))
      ) {
        // ponytail: legacy overlaps remain until explicit reflow; creation only guarantees its card adds no new overlap.
        return candidate;
      }
    }
  }

  const related = [...grouped]
    .map(([clusterKey, clusterNodes]) => ({
      key: clusterKey,
      nodes: clusterNodes,
      similarity: jaccardSimilarity(key, clusterKey),
    }))
    .filter(({ similarity }) => similarity > 0)
    .sort((a, b) => b.similarity - a.similarity || a.key.localeCompare(b.key))[0];
  const anchor = related ? bounds(related.nodes) : null;
  const origin = anchor ? { x: anchor.maxX + CLUSTER_GAP, y: anchor.minY } : fallback;
  const allBounds = [...grouped.values()].map(bounds);

  for (let attempt = 0; ; attempt += 1) {
    const candidate = {
      x: origin.x + (attempt % 4) * (cardSize.width + CLUSTER_GAP),
      y: origin.y + Math.floor(attempt / 4) * (cardSize.height + CLUSTER_GAP),
    };
    const rect = {
      minX: candidate.x,
      minY: candidate.y,
      maxX: candidate.x + cardSize.width,
      maxY: candidate.y + cardSize.height,
    };
    if (!allBounds.some((other) => overlaps(rect, other, CLUSTER_GAP))) return candidate;
  }
}

function orderClusterKeys(keys: string[]): string[] {
  const remaining = keys.slice().sort();
  const ordered = remaining.splice(0, 1);
  while (remaining.length) {
    const previous = ordered.at(-1) ?? "";
    remaining.sort(
      (a, b) =>
        jaccardSimilarity(previous, b) - jaccardSimilarity(previous, a) || a.localeCompare(b),
    );
    ordered.push(remaining.shift()!);
  }
  return ordered;
}

export function reflowClusters<T extends ClusterNode>(nodes: T[]): T[] {
  const grouped = clusters(nodes);
  const positions = new Map<string, { x: number; y: number }>();
  let shelfX = 0;
  let shelfY = 0;
  let shelfHeight = 0;

  for (const key of orderClusterKeys([...grouped.keys()])) {
    const clusterNodes = (grouped.get(key) ?? []).slice().sort((a, b) => a.id.localeCompare(b.id));
    const maxWidth = Math.max(...clusterNodes.map((node) => size(node).width));
    const maxHeight = Math.max(...clusterNodes.map((node) => size(node).height));
    const columns = Math.min(3, clusterNodes.length);
    const rows = Math.ceil(clusterNodes.length / 3);
    const clusterWidth = columns * maxWidth + (columns - 1) * CARD_GAP;
    const clusterHeight = rows * maxHeight + (rows - 1) * CARD_GAP;

    if (shelfX > 0 && shelfX + clusterWidth > REFLOW_SHELF_WIDTH) {
      shelfX = 0;
      shelfY += shelfHeight + CLUSTER_GAP;
      shelfHeight = 0;
    }

    clusterNodes.forEach((node, index) => {
      positions.set(node.id, {
        x: shelfX + (index % 3) * (maxWidth + CARD_GAP),
        y: shelfY + Math.floor(index / 3) * (maxHeight + CARD_GAP),
      });
    });
    shelfX += clusterWidth + CLUSTER_GAP;
    shelfHeight = Math.max(shelfHeight, clusterHeight);
  }

  return nodes.map((node) => ({ ...node, position: positions.get(node.id) ?? node.position }));
}
