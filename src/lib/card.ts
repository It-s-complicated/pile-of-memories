import { labelsAreValid, partitionLabels } from "./labels";
import { isHttpUrl, parseMarkdown } from "./markdown";

export type CardInput = {
  id: string;
  title: string;
  body: string;
  position: { x: number; y: number };
  tags: string[];
  topics: string[];
  links: string[];
  archived: boolean;
};

export type Card = CardInput & { createdAt: string; updatedAt: string };
export type CardChanges = Partial<Omit<CardInput, "id">>;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isCardId(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object";
}

function isPosition(value: unknown): value is CardInput["position"] {
  return (
    isRecord(value) &&
    typeof value.x === "number" &&
    Number.isFinite(value.x) &&
    typeof value.y === "number" &&
    Number.isFinite(value.y)
  );
}

export function parseCardInput(value: unknown): CardInput | null {
  const allowed = new Set([
    "id",
    "title",
    "body",
    "position",
    "tags",
    "topics",
    "links",
    "archived",
  ]);
  if (
    !isRecord(value) ||
    Object.keys(value).some((key) => !allowed.has(key)) ||
    !isCardId(value.id) ||
    typeof value.title !== "string" ||
    !value.title.trim() ||
    typeof value.body !== "string" ||
    !isPosition(value.position) ||
    !labelsAreValid(value.tags) ||
    !labelsAreValid(value.topics) ||
    value.tags.length + value.topics.length > 200 ||
    !Array.isArray(value.links) ||
    !value.links.every((link) => typeof link === "string") ||
    !value.links.every(isHttpUrl) ||
    typeof value.archived !== "boolean"
  ) {
    return null;
  }

  const labels = partitionLabels([...value.tags, ...value.topics]);

  return {
    id: value.id,
    title: value.title.trim(),
    body: value.body,
    position: value.position,
    ...labels,
    links: parseMarkdown(value.body).links,
    archived: value.archived,
  };
}

export function parseCardChanges(value: unknown): CardChanges | null {
  if (!isRecord(value)) return null;

  const keys = Object.keys(value);
  const allowed = new Set(["title", "body", "position", "tags", "topics", "links", "archived"]);
  if (
    keys.length === 0 ||
    keys.some((key) => !allowed.has(key)) ||
    ("links" in value && !("body" in value)) ||
    "tags" in value !== "topics" in value
  ) {
    return null;
  }

  const changes: CardChanges = {};

  if ("title" in value) {
    if (typeof value.title !== "string" || !value.title.trim()) return null;
    changes.title = value.title.trim();
  }
  if ("body" in value) {
    if (typeof value.body !== "string") return null;
    changes.body = value.body;
    changes.links = parseMarkdown(value.body).links;
  }
  if ("position" in value) {
    if (!isPosition(value.position)) return null;
    changes.position = value.position;
  }
  if ("tags" in value || "topics" in value) {
    const tags = "tags" in value ? value.tags : [];
    const topics = "topics" in value ? value.topics : [];
    if (!labelsAreValid(tags) || !labelsAreValid(topics) || tags.length + topics.length > 200) {
      return null;
    }
    Object.assign(changes, partitionLabels([...tags, ...topics]));
  }
  if ("links" in value) {
    if (!Array.isArray(value.links) || !value.links.every(isHttpUrl)) return null;
  }
  if ("archived" in value) {
    if (typeof value.archived !== "boolean") return null;
    changes.archived = value.archived;
  }

  return changes;
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    let message = response.statusText;
    if (isRecord(body) && typeof body.message === "string") message = body.message;
    if (response.status >= 500) message = "Database unavailable";
    throw new Error(message || `Request failed with status ${response.status}`);
  }

  return response.status === 204 ? (undefined as T) : response.json();
}

export function getCards(): Promise<Card[]> {
  return request("/api/cards");
}

export function createCard(card: CardInput): Promise<Card> {
  return request("/api/cards", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(card),
  });
}

export function patchCard(id: string, changes: CardChanges): Promise<Card> {
  return request(`/api/cards/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(changes),
  });
}

export function deleteCard(id: string): Promise<void> {
  return request(`/api/cards/${encodeURIComponent(id)}`, { method: "DELETE" });
}
