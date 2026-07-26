export const CLUSTER_GAP = 640;
export const CARD_GAP = 40;
export const DEFAULT_CARD_SIZE = { width: 320, height: 220 };
const REFLOW_ITERATIONS = 160;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

type ClusterNode = {
  id: string;
  position: { x: number; y: number };
  data: { tags: string[]; topics: string[] };
  width?: number;
  height?: number;
  measured?: { width?: number; height?: number };
};

type Rect = { minX: number; minY: number; maxX: number; maxY: number };
type ClusterBox<T extends ClusterNode> = {
  key: string;
  nodes: T[];
  width: number;
  height: number;
  x: number;
  y: number;
};

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

function clusterGap(left: string, right: string): number {
  return Math.round(CARD_GAP + (CLUSTER_GAP - CARD_GAP) * (1 - jaccardSimilarity(left, right)));
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

function clusters<T extends ClusterNode>(nodes: T[]): Map<string, T[]> {
  const result = new Map<string, T[]>();
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
    .map(([clusterKey, clusterNodes]) => ({
      gap: clusterGap(key, clusterKey),
      rect: bounds(clusterNodes),
    }));
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
        !otherBounds.some((other) => overlaps(rect, other.rect, other.gap))
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
  const origin = anchor
    ? { x: anchor.maxX + clusterGap(key, related.key), y: anchor.minY }
    : fallback;
  const allBounds = [...grouped].map(([clusterKey, clusterNodes]) => ({
    gap: clusterGap(key, clusterKey),
    rect: bounds(clusterNodes),
  }));

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
    if (!allBounds.some((other) => overlaps(rect, other.rect, other.gap))) return candidate;
  }
}

function clusterBoxes<T extends ClusterNode>(nodes: T[]): ClusterBox<T>[] {
  const boxes = [...clusters(nodes)]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, clusterNodes]) => {
      const orderedNodes = clusterNodes.slice().sort((a, b) => a.id.localeCompare(b.id));
      const maxWidth = Math.max(...orderedNodes.map((node) => size(node).width));
      const maxHeight = Math.max(...orderedNodes.map((node) => size(node).height));
      const columns = Math.min(3, orderedNodes.length);
      const rows = Math.ceil(orderedNodes.length / 3);

      return {
        key,
        nodes: orderedNodes,
        width: columns * maxWidth + (columns - 1) * CARD_GAP,
        height: rows * maxHeight + (rows - 1) * CARD_GAP,
        x: 0,
        y: 0,
      };
    });

  seedClusterBoxes(boxes);
  return boxes;
}

function targetDistance<T extends ClusterNode>(
  left: ClusterBox<T>,
  right: ClusterBox<T>,
  unitX: number,
  unitY: number,
): number {
  return (
    (Math.abs(unitX) * (left.width + right.width) +
      Math.abs(unitY) * (left.height + right.height)) /
      2 +
    clusterGap(left.key, right.key)
  );
}

function seedClusterBoxes<T extends ClusterNode>(boxes: ClusterBox<T>[]): void {
  if (boxes.length < 2) return;

  const root = boxes
    .map((box) => ({
      box,
      similarity: boxes.reduce((total, other) => total + jaccardSimilarity(box.key, other.key), 0),
    }))
    .sort((a, b) => b.similarity - a.similarity || a.box.key.localeCompare(b.box.key))[0].box;
  const links = boxes
    .filter((box) => box !== root)
    .map((box) => ({
      box,
      anchor: root,
      similarity: jaccardSimilarity(box.key, root.key),
    }));
  const childCount = new Map<string, number>();
  let placedCount = 1;

  while (links.length) {
    links.sort(
      (a, b) =>
        b.similarity - a.similarity ||
        a.box.key.localeCompare(b.box.key) ||
        a.anchor.key.localeCompare(b.anchor.key),
    );
    const link = links.shift()!;
    if (link.similarity > 0) {
      const childIndex = childCount.get(link.anchor.key) ?? 0;
      const angle = childIndex * GOLDEN_ANGLE;
      const unitX = Math.cos(angle);
      const unitY = Math.sin(angle);
      const distance = targetDistance(link.anchor, link.box, unitX, unitY);
      link.box.x = link.anchor.x + unitX * distance;
      link.box.y = link.anchor.y + unitY * distance;
      childCount.set(link.anchor.key, childIndex + 1);
    } else {
      const angle = placedCount * GOLDEN_ANGLE;
      const radius = Math.sqrt(placedCount) * (DEFAULT_CARD_SIZE.width + CLUSTER_GAP);
      link.box.x = Math.cos(angle) * radius;
      link.box.y = Math.sin(angle) * radius;
    }
    placedCount += 1;

    for (const candidate of links) {
      const similarity = jaccardSimilarity(candidate.box.key, link.box.key);
      if (
        similarity > candidate.similarity ||
        (similarity === candidate.similarity && link.box.key < candidate.anchor.key)
      ) {
        candidate.anchor = link.box;
        candidate.similarity = similarity;
      }
    }
  }
}

function relaxClusterBoxes<T extends ClusterNode>(boxes: ClusterBox<T>[]): void {
  // ponytail: pairwise passes are deliberate for a board capped at 200 cards; use a spatial index if that grows.
  for (let iteration = 0; iteration < REFLOW_ITERATIONS; iteration += 1) {
    const movement = boxes.map(() => ({ x: 0, y: 0 }));
    const strength = (0.18 * (1 - iteration / REFLOW_ITERATIONS)) / Math.max(1, boxes.length - 1);

    for (let leftIndex = 0; leftIndex < boxes.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < boxes.length; rightIndex += 1) {
        const left = boxes[leftIndex];
        const right = boxes[rightIndex];
        let dx = right.x - left.x;
        let dy = right.y - left.y;
        let distance = Math.hypot(dx, dy);
        if (distance === 0) {
          const angle = (leftIndex + 1) * (rightIndex + 1) * GOLDEN_ANGLE;
          dx = Math.cos(angle);
          dy = Math.sin(angle);
          distance = 1;
        }

        const unitX = dx / distance;
        const unitY = dy / distance;
        const similarity = jaccardSimilarity(left.key, right.key);
        const target = targetDistance(left, right, unitX, unitY);
        const correction = ((distance - target) * strength * (1 + 4 * similarity)) / 2;

        movement[leftIndex].x += unitX * correction;
        movement[leftIndex].y += unitY * correction;
        movement[rightIndex].x -= unitX * correction;
        movement[rightIndex].y -= unitY * correction;
      }
    }

    boxes.forEach((box, index) => {
      box.x += movement[index].x;
      box.y += movement[index].y;
    });
  }
}

function separationDirection(delta: number, pairIndex: number): number {
  if (delta !== 0) return Math.sign(delta);
  return pairIndex % 2 === 0 ? -1 : 1;
}

function separateClusterBoxes<T extends ClusterNode>(boxes: ClusterBox<T>[]): void {
  for (let iteration = 0; iteration < REFLOW_ITERATIONS; iteration += 1) {
    let moved = false;
    for (let leftIndex = 0; leftIndex < boxes.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < boxes.length; rightIndex += 1) {
        const left = boxes[leftIndex];
        const right = boxes[rightIndex];
        const dx = right.x - left.x;
        const dy = right.y - left.y;
        const gap = clusterGap(left.key, right.key);
        const overlapX = (left.width + right.width) / 2 + gap - Math.abs(dx);
        const overlapY = (left.height + right.height) / 2 + gap - Math.abs(dy);
        if (overlapX <= 0 || overlapY <= 0) continue;

        moved = true;
        if (overlapX < overlapY) {
          const direction = separationDirection(dx, leftIndex + rightIndex);
          left.x -= (direction * overlapX) / 2;
          right.x += (direction * overlapX) / 2;
        } else {
          const direction = separationDirection(dy, leftIndex + rightIndex);
          left.y -= (direction * overlapY) / 2;
          right.y += (direction * overlapY) / 2;
        }
      }
    }
    if (!moved) return;
  }
}

export function reflowClusters<T extends ClusterNode>(nodes: T[]): T[] {
  if (nodes.length === 0) return [];

  const boxes = clusterBoxes(nodes);
  relaxClusterBoxes(boxes);
  separateClusterBoxes(boxes);
  const positions = new Map<string, { x: number; y: number }>();
  const minX = Math.min(...boxes.map((box) => box.x - box.width / 2));
  const minY = Math.min(...boxes.map((box) => box.y - box.height / 2));

  for (const box of boxes) {
    const maxWidth = Math.max(...box.nodes.map((node) => size(node).width));
    const maxHeight = Math.max(...box.nodes.map((node) => size(node).height));
    box.nodes.forEach((node, index) => {
      positions.set(node.id, {
        x: Math.round(box.x - box.width / 2 - minX + (index % 3) * (maxWidth + CARD_GAP)),
        y: Math.round(
          box.y - box.height / 2 - minY + Math.floor(index / 3) * (maxHeight + CARD_GAP),
        ),
      });
    });
  }

  return nodes.map((node) => ({ ...node, position: positions.get(node.id) ?? node.position }));
}
