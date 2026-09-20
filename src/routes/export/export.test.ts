import { beforeEach, expect, it, vi } from "vite-plus/test";
import type { Card } from "#lib/card.js";
import { PRIMARY_TAGS, TOPIC_TAGS } from "#lib/labels.js";

const { listCards, getRequestEvent } = vi.hoisted(() => ({
  listCards: vi.fn<() => Promise<Card[]>>(),
  getRequestEvent: vi.fn(),
}));
vi.mock("#lib/server/database.js", () => ({ listCards }));
vi.mock("$app/server", () => ({ getRequestEvent }));

import { GET } from "./+server";

beforeEach(() => {
  vi.resetAllMocks();
  getRequestEvent.mockReturnValue({ locals: { user: { id: "owner" } } });
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
    version: 1,
    exportedAt: expect.any(String),
    memories,
    tags: [...PRIMARY_TAGS],
    topics: [...TOPIC_TAGS, "Custom topic"],
  });
  expect(Number.isNaN(Date.parse(data.exportedAt))).toBe(false);
});

it("exports the hardcoded vocabulary for an empty board", async () => {
  listCards.mockResolvedValue([]);
  expect(await (await GET()).json()).toMatchObject({
    memories: [],
    tags: [...PRIMARY_TAGS],
    topics: [...TOPIC_TAGS],
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
