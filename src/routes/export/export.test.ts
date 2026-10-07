import { beforeEach, expect, it, vi } from "vite-plus/test";
import type { Card } from "#lib/card.js";
import type { ManagedLabel } from "#lib/labels.js";
const vocabulary: ManagedLabel[] = [
  {
    id: "00000000-0000-4000-8000-000000000001",
    name: "Project",
    kind: "tag",
    description: "A concrete undertaking.",
    usageCount: 2,
  },
  {
    id: "00000000-0000-4000-8000-000000000002",
    name: "AI",
    kind: "topic",
    description: "Artificial intelligence.",
    usageCount: 2,
  },
  {
    id: "00000000-0000-4000-8000-000000000003",
    name: "Custom topic",
    kind: "topic",
    description: "A custom definition.",
    usageCount: 0,
  },
];

const { listCards, listLabels, getRequestEvent } = vi.hoisted(() => ({
  listCards: vi.fn<() => Promise<Card[]>>(),
  listLabels: vi.fn<() => Promise<ManagedLabel[]>>(),
  getRequestEvent: vi.fn(),
}));
vi.mock("#lib/server/database.js", () => ({ listCards, listLabels }));
vi.mock("$app/server", () => ({ getRequestEvent }));

import { GET } from "./+server";

beforeEach(() => {
  vi.resetAllMocks();
  getRequestEvent.mockReturnValue({ locals: { user: { id: "owner" } } });
  listLabels.mockResolvedValue(vocabulary);
});

it("downloads every saved field, archived memories and the full label vocabulary", async () => {
  const memory: Card = {
    kind: "memory",
    id: "a0fa877d-fec6-47e4-8b71-1074f7eab732",
    title: "A memory — 日本語",
    body: "## Notes\n[Link](https://example.com)",
    position: { x: -120, y: 45 },
    tags: ["Project"],
    topics: ["Custom topic", "ai"],
    links: ["https://example.com"],
    archived: false,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-02T00:00:00.000Z",
  };
  const memories = [
    memory,
    { ...memory, id: "ef39515f-49b7-483d-84d9-a1f91eec85ab", archived: true },
  ];
  listCards.mockResolvedValue(memories);
  const response = await GET();
  const data = await response.json();
  expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
  expect(response.headers.get("content-disposition")).toMatch(
    /^attachment; filename="pile-of-memories-\d{4}-\d{2}-\d{2}\.json"$/,
  );
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(data).toEqual({
    version: 2,
    exportedAt: expect.any(String),
    memories,
    labels: vocabulary.map(({ usageCount: _usageCount, ...label }) => label),
    tags: ["Project"],
    topics: ["AI", "Custom topic"],
  });
  expect(Number.isNaN(Date.parse(data.exportedAt))).toBe(false);
});

it("exports unused managed definitions even for an empty board", async () => {
  listCards.mockResolvedValue([]);
  expect(await (await GET()).json()).toMatchObject({
    memories: [],
    tags: ["Project"],
    topics: ["AI", "Custom topic"],
  });
});

it("rejects unauthenticated requests before reading memories", async () => {
  getRequestEvent.mockReturnValue({ locals: { user: null } });
  await expect(GET()).rejects.toMatchObject({ status: 401 });
  expect(listCards).not.toHaveBeenCalled();
});

it("fails instead of downloading an empty backup when the database is unavailable", async () => {
  listCards.mockRejectedValue(new Error("private connection details"));
  await expect(GET()).rejects.toMatchObject({
    status: 503,
    body: { message: "Could not export memories. Please try again." },
  });
});
