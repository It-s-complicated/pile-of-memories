export const CLUSTER_GAP = 180;
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

function labels(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim().toLowerCase()).filter(Boolean))].sort();
}

// One category per card, independent of tag order or additional topics.
// Cards without a primary category use their first topic, or the inbox.
export function getClusterKey(data: ClusterNode["data"]): string {
  return labels(data.tags)[0] ?? labels(data.topics)[0] ?? "";
}

function size(node: ClusterNode) {
  return {
    width: node.measured?.width ?? node.width ?? DEFAULT_CARD_SIZE.width,
    height: node.measured?.height ?? node.height ?? DEFAULT_CARD_SIZE.height,
  };
}

function bounds(nodes: ClusterNode[]) {
  const x = Math.min(...nodes.map((node) => node.position.x));
  const y = Math.min(...nodes.map((node) => node.position.y));
  return {
    x,
    y,
    width: Math.max(...nodes.map((node) => node.position.x + size(node).width)) - x,
    height: Math.max(...nodes.map((node) => node.position.y + size(node).height)) - y,
  };
}

function clusters<T extends ClusterNode>(nodes: T[]) {
  const grouped = new Map<string, T[]>();
  for (const node of nodes) {
    const key = getClusterKey(node.data);
    const group = grouped.get(key) ?? [];
    group.push(node);
    grouped.set(key, group);
  }
  return [...grouped].sort(([a], [b]) => a.localeCompare(b));
}

export function getClusterRegions(nodes: ClusterNode[]) {
  return clusters(nodes).map(([key, group]) => {
    const rect = bounds(group);
    const name =
      group
        .flatMap(({ data }) => [...data.tags, ...data.topics])
        .find((label) => label.trim().toLowerCase() === key)
        ?.trim() ?? "Inbox";
    return {
      key,
      name,
      count: group.length,
      x: rect.x - 24,
      y: rect.y - 52,
      width: rect.width + 48,
      height: rect.height + 76,
    };
  });
}

export function findClusterPosition(
  nodes: ClusterNode[],
  data: ClusterNode["data"],
  fallback: { x: number; y: number },
): { x: number; y: number } {
  if (!nodes.length) return fallback;
  const key = getClusterKey(data);
  const group = nodes.filter((node) => getClusterKey(node.data) === key);
  const anchor = group.length ? bounds(group) : { ...fallback, width: 0, height: 0 };
  const gap = group.length ? CARD_GAP : CLUSTER_GAP;
  const free = (position: { x: number; y: number }) =>
    nodes.every((node) => {
      const other = size(node);
      const clearance = getClusterKey(node.data) === key ? CARD_GAP : CLUSTER_GAP;
      return (
        position.x + DEFAULT_CARD_SIZE.width + clearance <= node.position.x ||
        node.position.x + other.width + clearance <= position.x ||
        position.y + DEFAULT_CARD_SIZE.height + clearance <= node.position.y ||
        node.position.y + other.height + clearance <= position.y
      );
    });
  if (!group.length && free(fallback)) return fallback;
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

type LayoutBox = { x: number; y: number; width: number; height: number; labels: string[] };

// The previous layout's golden-angle seeding and attraction, applied both to
// cards and category islands. Coordinates here are rectangle centers.
function arrangeOrganic(boxes: LayoutBox[], gap: number): void {
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  boxes.forEach((box, index) => {
    const radius = Math.sqrt(index) * (DEFAULT_CARD_SIZE.width + gap);
    box.x = Math.cos(index * goldenAngle) * radius;
    box.y = Math.sin(index * goldenAngle) * radius;
  });

  // ponytail: pairwise relaxation suits personal boards; use a spatial index if large boards make this slow.
  for (let iteration = 0; iteration < 160; iteration += 1) {
    const strength = (0.18 * (1 - iteration / 160)) / Math.max(1, boxes.length - 1);
    for (const [index, left] of boxes.entries()) {
      for (const right of boxes.slice(index + 1)) {
        const dx = right.x - left.x;
        const dy = right.y - left.y;
        const distance = Math.hypot(dx, dy) || 1;
        const union = new Set([...left.labels, ...right.labels]);
        const similarity = union.size
          ? left.labels.filter((label) => right.labels.includes(label)).length / union.size
          : 0;
        const target =
          (Math.abs(dx / distance) * (left.width + right.width) +
            Math.abs(dy / distance) * (left.height + right.height)) /
            2 +
          gap;
        const correction = ((distance - target) * strength * (1 + 4 * similarity)) / 2;
        left.x += (dx / distance) * correction;
        left.y += (dy / distance) * correction;
        right.x -= (dx / distance) * correction;
        right.y -= (dy / distance) * correction;
      }
    }
  }

  // Keep the organic angles while resolving actual rectangular collisions.
  for (let iteration = 0; iteration < 160; iteration += 1) {
    let moved = false;
    for (const [index, left] of boxes.entries()) {
      for (const right of boxes.slice(index + 1)) {
        const dx = right.x - left.x;
        const dy = right.y - left.y;
        const overlapX = (left.width + right.width) / 2 + gap + 1 - Math.abs(dx);
        const overlapY = (left.height + right.height) / 2 + gap + 1 - Math.abs(dy);
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
}

export function reflowClusters<T extends ClusterNode>(nodes: T[]): T[] {
  if (!nodes.length) return [];
  const groups = clusters(nodes).map(([, group]) => {
    const ordered = group.toSorted(
      (a, b) =>
        labels(a.data.topics).join("\u001f").localeCompare(labels(b.data.topics).join("\u001f")) ||
        a.id.localeCompare(b.id),
    );
    const boxes = ordered.map((node) => ({
      x: 0,
      y: 0,
      ...size(node),
      labels: labels(node.data.topics),
    }));
    arrangeOrganic(boxes, CARD_GAP);
    const positioned = ordered.map((node, index) => ({
      ...node,
      position: { x: boxes[index].x, y: boxes[index].y },
    }));
    return {
      nodes: positioned,
      ...bounds(positioned),
      labels: labels(group.flatMap(({ data }) => [...data.tags, ...data.topics])),
    };
  });
  arrangeOrganic(groups, CLUSTER_GAP);
  const positions = new Map<string, { x: number; y: number }>();
  for (const group of groups) {
    for (const node of group.nodes)
      positions.set(node.id, { x: group.x + node.position.x, y: group.y + node.position.y });
  }
  return nodes.map((node) => ({ ...node, position: positions.get(node.id)! }));
}
