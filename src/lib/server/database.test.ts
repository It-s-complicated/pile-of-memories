import { expect, it, vi } from "vite-plus/test";

const { sql } = vi.hoisted(() => ({ sql: vi.fn() }));
vi.mock("postgres", () => ({ default: () => sql }));
vi.mock("$app/env/private", () => ({ DATABASE_CONNECTION_STRING: "test" }));

import {
  insertCard,
  listCards,
  recordEnrichmentAttemptFailed,
  recordEnrichmentAttemptSucceeded,
  updateCard,
} from "./database";

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
