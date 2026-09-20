export const CLUSTER_GAP = 160;
export const CARD_GAP = 24;
export const DEFAULT_CARD_SIZE = { width: 320, height: 220 };

type ClusterNode = {
  id: string;
  position: { x: number; y: number };
  data: { tags: string[]; topics: string[] };
  width?: number;
  height?: number;
  measured?: { width?: number; height?: number };
};

// Topics describe the content more precisely than broad categories.
function labels(data: ClusterNode["data"]): Map<string, number> {
  const weights = new Map<string, number>();
  for (const [values, weight] of [
    [data.tags, 1],
    [data.topics, 2],
  ] as const) {
    for (const value of values) {
      const label = value.trim().toLowerCase();
      if (label) weights.set(label, Math.max(weights.get(label) ?? 0, weight));
    }
  }
  return weights;
}

function similarity(left: Map<string, number>, right: Map<string, number>): number {
  let shared = 0;
  let total = 0;
  for (const label of new Set([...left.keys(), ...right.keys()])) {
    shared += Math.min(left.get(label) ?? 0, right.get(label) ?? 0);
    total += Math.max(left.get(label) ?? 0, right.get(label) ?? 0);
  }
  return total ? shared / total : 0;
}

function size(node: ClusterNode) {
  return {
    width: node.measured?.width ?? node.width ?? DEFAULT_CARD_SIZE.width,
    height: node.measured?.height ?? node.height ?? DEFAULT_CARD_SIZE.height,
  };
}

export function findClusterPosition(
  nodes: ClusterNode[],
  data: ClusterNode["data"],
  fallback: { x: number; y: number },
): { x: number; y: number } {
  if (!nodes.length) return fallback;
  const incomingLabels = labels(data);
  const matches = nodes
    .map((node) => ({ node, similarity: similarity(incomingLabels, labels(node.data)) }))
    .toSorted((a, b) => b.similarity - a.similarity || a.node.id.localeCompare(b.node.id));
  const match = matches[0];
  const anchor =
    match.similarity > 0
      ? { ...match.node.position, ...size(match.node) }
      : { ...fallback, width: 0, height: 0 };
  const gap = CARD_GAP + (CLUSTER_GAP - CARD_GAP) * (1 - match.similarity);
  const free = (position: { x: number; y: number }) =>
    nodes.every((node) => {
      const other = size(node);
      const clearance = CARD_GAP;
      return (
        position.x + DEFAULT_CARD_SIZE.width + clearance <= node.position.x ||
        node.position.x + other.width + clearance <= position.x ||
        position.y + DEFAULT_CARD_SIZE.height + clearance <= node.position.y ||
        node.position.y + other.height + clearance <= position.y
      );
    });
  if (!match.similarity && free(fallback)) return fallback;
  // Search outward without moving existing cards or accepting overlapping slots.
  for (let ring = 0; ; ring += 1) {
    const dx = gap + ring * (DEFAULT_CARD_SIZE.width + gap);
    const dy = gap + ring * (DEFAULT_CARD_SIZE.height + gap);
    const candidates = [
      { x: anchor.x + anchor.width + dx, y: anchor.y },
      { x: anchor.x - DEFAULT_CARD_SIZE.width - dx, y: anchor.y },
      { x: anchor.x, y: anchor.y + anchor.height + dy },
      { x: anchor.x, y: anchor.y - DEFAULT_CARD_SIZE.height - dy },
    ];
    const position = candidates.find(free);
    if (position) return position;
  }
}

type LayoutBox = { x: number; y: number; width: number; height: number };

// A golden-angle seed keeps the board organic; the second pass only separates
// rectangles, so the result stays compact without becoming a row/column grid.
function pack(boxes: LayoutBox[], gap: number, seedScale = 0.35) {
  const angle = Math.PI * (3 - Math.sqrt(5));
  boxes.forEach((box, index) => {
    const radius = Math.sqrt(index + 0.5) * Math.max(box.width, box.height) * seedScale;
    box.x = Math.cos(index * angle) * radius;
    box.y = Math.sin(index * angle) * radius;
  });

  for (let iteration = 0; iteration < 240; iteration += 1) {
    let moved = false;
    for (const [index, left] of boxes.entries()) {
      for (const right of boxes.slice(index + 1)) {
        const dx = right.x - left.x;
        const dy = right.y - left.y;
        const overlapX = (left.width + right.width) / 2 + gap - Math.abs(dx);
        const overlapY = (left.height + right.height) / 2 + gap - Math.abs(dy);
        if (overlapX <= 0 || overlapY <= 0) continue;
        moved = true;
        if (overlapX < overlapY) {
          const shift = ((Math.sign(dx) || 1) * overlapX) / 2;
          left.x -= shift;
          right.x += shift;
        } else {
          const shift = ((Math.sign(dy) || 1) * overlapY) / 2;
          left.y -= shift;
          right.y += shift;
        }
      }
    }
    if (!moved) break;
  }

  const minX = Math.min(...boxes.map((box) => box.x - box.width / 2));
  const minY = Math.min(...boxes.map((box) => box.y - box.height / 2));
  for (const box of boxes) {
    box.x = Math.round(box.x - box.width / 2 - minX);
    box.y = Math.round(box.y - box.height / 2 - minY);
  }
  return {
    width: Math.max(...boxes.map((box) => box.x + box.width)),
    height: Math.max(...boxes.map((box) => box.y + box.height)),
  };
}

export function reflowClusters<T extends ClusterNode>(nodes: T[]): T[] {
  if (!nodes.length) return [];
  const ordered = nodes.toSorted((a, b) => a.id.localeCompare(b.id));
  const boxes = ordered.map((node) => ({
    x: 0,
    y: 0,
    ...size(node),
    labels: labels(node.data),
  }));
  const affinities = boxes.map((left) =>
    boxes.map((right) => similarity(left.labels, right.labels)),
  );
  const groups = boxes.map((_, index) => [index]);
  // Complete-link grouping prevents a bridge card from joining unrelated groups.
  // ponytail: cubic grouping suits personal boards; replace with cached linkage if boards grow large.
  for (;;) {
    let best = 0.25;
    let merge: [number, number] | undefined;
    for (let i = 0; i < groups.length; i += 1) {
      for (let j = i + 1; j < groups.length; j += 1) {
        const affinity = Math.min(
          ...groups[i].flatMap((a) => groups[j].map((b) => affinities[a][b])),
        );
        if (affinity >= best && (!merge || affinity > best)) {
          best = affinity;
          merge = [i, j];
        }
      }
    }
    if (!merge) break;
    groups[merge[0]].push(...groups[merge[1]]);
    groups.splice(merge[1], 1);
  }

  const islands = groups
    .map((indices) => {
      const members = indices.map((index) => boxes[index]);
      const cohesion = Math.min(...indices.flatMap((a) => indices.map((b) => affinities[a][b])));
      return { x: 0, y: 0, members, ...pack(members, CARD_GAP * (1 + 2 * (1 - cohesion))) };
    })
    .toSorted((a, b) => b.height - a.height);

  pack(islands, CLUSTER_GAP, 0.18);
  for (const island of islands) {
    for (const box of island.members) {
      box.x += island.x;
      box.y += island.y;
    }
  }
  const positions = new Map(
    ordered.map((node, index) => [node.id, { x: boxes[index].x, y: boxes[index].y }]),
  );
  return nodes.map((node) => ({ ...node, position: positions.get(node.id)! }));
}
