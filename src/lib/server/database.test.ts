import { expect, it, vi } from "vite-plus/test";

const { sql } = vi.hoisted(() => ({ sql: vi.fn() }));
vi.mock("postgres", () => ({ default: () => sql }));
vi.mock("$app/env/private", () => ({ DATABASE_CONNECTION_STRING: "test" }));

import { insertCard, listCards, updateCard } from "./database";

it("writes only card content and derives links from returned Markdown", async () => {
  const input = {
    id: "00000000-0000-4000-8000-000000000001",
    kind: "memory" as const,
    title: "Reference",
    body: "Read [this](https://example.com).",
    position: { x: 0, y: 0 },
    tags: [],
    topics: [],
    archived: false,
  };
  const { position, ...content } = input;
  const row = {
    ...content,
    x: position.x,
    y: position.y,
    created_at: new Date("2026-01-01T00:00:00.000Z"),
    updated_at: new Date("2026-01-01T00:00:00.000Z"),
  };
  sql.mockResolvedValue([row]);

  expect((await insertCard(input)).links).toEqual(["https://example.com"]);
  expect(sql.mock.calls[0][0].join("")).not.toMatch(/\blinks\b/);
  expect((await listCards())[0].links).toEqual(["https://example.com"]);

  row.body = "No links";
  sql.mockClear();
  // sql(values) builds the SET clause before the outer tagged query runs.
  sql.mockReturnValueOnce("body = value");
  expect((await updateCard(input.id, { body: row.body }))?.links).toEqual([]);
  expect(sql.mock.calls[0][0]).toEqual({ body: row.body, updated_at: expect.any(Date) });
  expect((await listCards())[0].links).toEqual([]);
});
