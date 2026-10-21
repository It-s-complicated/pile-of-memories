import { expect, it, vi } from "vite-plus/test";

const { sql } = vi.hoisted(() => ({ sql: Object.assign(vi.fn(), { begin: vi.fn() }) }));
vi.mock("postgres", () => ({ default: () => sql }));
vi.mock("$app/env/private", () => ({ DATABASE_CONNECTION_STRING: "test", DATABASE_SSL: "true" }));

import {
  insertCard,
  listCards,
  getBoardSnapshot,
  updateLabel,
  deleteLabel,
  recordEnrichmentAttemptFailed,
  recordEnrichmentAttemptSucceeded,
  updateCard,
} from "./database";

it("reads export cards and vocabulary on the same repeatable-read connection", async () => {
  sql.mockReset();
  const label = {
    id: "00000000-0000-4000-8000-000000000001",
    name: "Project",
    kind: "tag",
    description: "A concrete undertaking.",
    usageCount: 0,
  };
  const transaction = vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([label]);
  sql.begin.mockImplementationOnce((_options, read) => read(transaction));

  await expect(getBoardSnapshot()).resolves.toEqual({ memories: [], vocabulary: [label] });
  expect(sql.begin).toHaveBeenCalledWith(
    "isolation level repeatable read read only",
    expect.any(Function),
  );
  expect(transaction.mock.calls.map(([query]) => query.join(""))).toEqual([
    expect.stringContaining("FROM cards"),
    expect.stringContaining("FROM memory_labels"),
  ]);
  expect(sql).not.toHaveBeenCalled();
});

it("retries the whole label edit after a deadlock before reading its saved result", async () => {
  sql.mockReset();
  const label = {
    id: "00000000-0000-4000-8000-000000000001",
    name: "Renamed",
    kind: "topic" as const,
    description: "Updated definition",
    usageCount: 1,
  };
  sql
    .mockRejectedValueOnce({ code: "40P01" })
    .mockResolvedValueOnce(Object.assign([], { count: 1 }))
    .mockResolvedValueOnce([label]);

  await expect(updateLabel(label.id, label)).resolves.toEqual(label);
  expect(sql).toHaveBeenCalledTimes(3);
  expect(sql.mock.calls[0]).toEqual(sql.mock.calls[1]);
  expect(sql.mock.calls[2][0].join("")).toContain("FROM memory_labels");
});

it("retries a deadlocked label deletion", async () => {
  sql.mockReset();
  sql.mockRejectedValueOnce({ code: "40P01" }).mockResolvedValueOnce({ count: 1 });
  await expect(deleteLabel("00000000-0000-4000-8000-000000000001")).resolves.toBe(true);
  expect(sql).toHaveBeenCalledTimes(2);
  expect(sql.mock.calls[0]).toEqual(sql.mock.calls[1]);
});

it.each([
  [{ code: "40P01" }, 3],
  [{ code: "23505" }, 1],
  [{ code: "23503" }, 1],
  [new Error("Connection lost"), 1],
])("bounds retries and preserves database failures (%j)", async (error, attempts) => {
  sql.mockReset();
  sql.mockRejectedValue(error);
  await expect(deleteLabel("00000000-0000-4000-8000-000000000001")).rejects.toBe(error);
  expect(sql).toHaveBeenCalledTimes(attempts);
});

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

it("replaces completed attempt fields when switching between success and failure", async () => {
  const completedAt = Symbol("now()");
  sql.mockImplementation((first) => {
    if (!Array.isArray(first)) return first;
    return first.join("") === "now()" ? completedAt : Promise.resolve([]);
  });
  const attempt = {
    id: "00000000-0000-4000-8000-000000000001",
    provider: "test-provider",
    model: "test-model",
    promptVersion: "v1",
    latencyMs: 125,
    inputCharacterCount: 20,
    existingTagCount: 2,
    usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15, providerCost: 0.01 },
    generatedTitleFingerprint: "title-fingerprint",
    generatedTagFingerprints: ["tag-fingerprint"],
    generatedTagCount: 1,
    vocabularyReuseCount: 0,
  };
  const succeededRow = {
    status: "succeeded",
    provider: attempt.provider,
    model: attempt.model,
    prompt_version: attempt.promptVersion,
    error_code: null,
    latency_ms: attempt.latencyMs,
    input_character_count: attempt.inputCharacterCount,
    existing_tag_count: attempt.existingTagCount,
    generated_title_fingerprint: attempt.generatedTitleFingerprint,
    generated_tag_fingerprints: attempt.generatedTagFingerprints,
    generated_tag_count: 1,
    vocabulary_reuse_count: 0,
    prompt_tokens: 10,
    completion_tokens: 5,
    total_tokens: 15,
    provider_cost: 0.01,
    completed_at: completedAt,
  };
  function expectWrite(row: Record<string, unknown>): void {
    expect(sql.mock.calls).toEqual([
      [expect.arrayContaining(["now()"])],
      [{ id: attempt.id, ...row }],
      [row],
      [expect.any(Array), { id: attempt.id, ...row }, row],
    ]);
    expect(sql.mock.calls.at(-1)![0].join("")).toMatch(/ON CONFLICT \(id\) DO UPDATE SET/);
    sql.mockClear();
  }

  sql.mockClear();
  await recordEnrichmentAttemptSucceeded(attempt);
  expectWrite(succeededRow);

  await recordEnrichmentAttemptFailed({
    ...attempt,
    errorCode: "provider_timeout",
    usage: { promptTokens: null, completionTokens: null, totalTokens: null, providerCost: null },
  });
  expectWrite({
    ...succeededRow,
    status: "failed",
    error_code: "provider_timeout",
    generated_title_fingerprint: null,
    generated_tag_fingerprints: null,
    generated_tag_count: null,
    vocabulary_reuse_count: null,
    prompt_tokens: null,
    completion_tokens: null,
    total_tokens: null,
    provider_cost: null,
  });

  await recordEnrichmentAttemptSucceeded(attempt);
  expectWrite(succeededRow);
});
