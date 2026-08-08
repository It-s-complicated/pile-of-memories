import { DATABASE_CONNECTION_STRING } from "$app/env/private";
import postgres from "postgres";
import type { Card, CardChanges, CardInput, CardPositionUpdate } from "../card";
import {
  compareTagFingerprints,
  type EnrichmentAttemptFailed,
  type EnrichmentAttemptStarted,
  type EnrichmentAttemptSucceeded,
  type EnrichmentReviewJob,
} from "../enrichment-analytics";
import { parseMarkdown } from "../markdown";

let database: ReturnType<typeof postgres> | undefined;

function getSql(): ReturnType<typeof postgres> {
  if (!DATABASE_CONNECTION_STRING) {
    throw new Error("DATABASE_CONNECTION_STRING is not set");
  }
  return (database ??= postgres(DATABASE_CONNECTION_STRING, { ssl: "require" }));
}

type CardRow = {
  id: string;
  title: string;
  body: string;
  x: number;
  y: number;
  tags: string[];
  topics: string[];
  links: string[];
  archived: boolean;
  created_at: Date;
  updated_at: Date;
};

function toCard(row: CardRow): Card {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    position: { x: row.x, y: row.y },
    tags: row.tags,
    topics: row.topics,
    links: parseMarkdown(row.body).links,
    archived: row.archived,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

async function findCard(id: string): Promise<Card | null> {
  const sql = getSql();
  const [row] = await sql<CardRow[]>`SELECT * FROM cards WHERE id = ${id}`;
  return row ? toCard(row) : null;
}

export async function listCards(): Promise<Card[]> {
  const sql = getSql();
  const rows = await sql<CardRow[]>`SELECT * FROM cards ORDER BY created_at, id`;
  return rows.map(toCard);
}

export async function insertCard(card: CardInput): Promise<Card> {
  const sql = getSql();
  const [row] = await sql<CardRow[]>`
    INSERT INTO cards (id, title, body, x, y, tags, topics, links, archived)
    VALUES (
      ${card.id}, ${card.title}, ${card.body}, ${card.position.x}, ${card.position.y},
      ${card.tags}, ${card.topics}, ${card.links}, ${card.archived}
    )
    ON CONFLICT (id) DO NOTHING
    RETURNING *
  `;

  const existing = row ? toCard(row) : await findCard(card.id);
  if (!existing) throw new Error("Card disappeared while it was being created");
  return existing;
}

export async function updateCard(id: string, changes: CardChanges): Promise<Card | null> {
  const sql = getSql();
  const values: Record<string, string | number | boolean | string[] | Date> = {
    updated_at: new Date(),
  };

  if (changes.title !== undefined) values.title = changes.title;
  if (changes.body !== undefined) values.body = changes.body;
  if (changes.position !== undefined) {
    values.x = changes.position.x;
    values.y = changes.position.y;
  }
  if (changes.tags !== undefined) values.tags = changes.tags;
  if (changes.topics !== undefined) values.topics = changes.topics;
  if (changes.links !== undefined) values.links = changes.links;
  if (changes.archived !== undefined) values.archived = changes.archived;

  const [row] = await sql<CardRow[]>`
    UPDATE cards SET ${sql(values)} WHERE id = ${id} RETURNING *
  `;
  return row ? toCard(row) : null;
}

export async function removeCard(id: string): Promise<boolean> {
  const sql = getSql();
  const result = await sql`DELETE FROM cards WHERE id = ${id}`;
  return result.count > 0;
}

class MissingCardInPositionBatch extends Error {}

export async function updateCardPositions(positions: CardPositionUpdate[]): Promise<Card[] | null> {
  const sql = getSql();

  try {
    return await sql.begin(async (transaction) => {
      const rows = await transaction<CardRow[]>`
        UPDATE cards AS card
        SET x = position.x, y = position.y, updated_at = now()
        FROM unnest(
          ${positions.map(({ id }) => id)}::uuid[],
          ${positions.map(({ position }) => position.x)}::double precision[],
          ${positions.map(({ position }) => position.y)}::double precision[]
        ) AS position(id, x, y)
        WHERE card.id = position.id
        RETURNING card.*
      `;

      if (rows.length !== positions.length) throw new MissingCardInPositionBatch();
      const cards = new Map(rows.map((row) => [row.id, toCard(row)]));
      return positions.map(({ id }) => cards.get(id)!);
    });
  } catch (error) {
    if (error instanceof MissingCardInPositionBatch) return null;
    throw error;
  }
}

export async function recordEnrichmentAttemptStarted(
  attempt: EnrichmentAttemptStarted,
): Promise<void> {
  const sql = getSql();
  await sql`
    INSERT INTO analytics_ai_enrichment_attempts (
      id, status, provider, model, prompt_version, input_character_count, existing_tag_count
    ) VALUES (
      ${attempt.id}, 'started', ${attempt.provider}, ${attempt.model}, ${attempt.promptVersion},
      ${attempt.inputCharacterCount}, ${attempt.existingTagCount}
    )
    ON CONFLICT (id) DO NOTHING
  `;
}

export async function recordEnrichmentAttemptSucceeded(
  attempt: EnrichmentAttemptSucceeded,
): Promise<void> {
  const sql = getSql();
  await sql`
    INSERT INTO analytics_ai_enrichment_attempts (
      id, status, provider, model, prompt_version, latency_ms, input_character_count,
      existing_tag_count, generated_title_fingerprint, generated_tag_fingerprints,
      generated_tag_count, vocabulary_reuse_count, prompt_tokens, completion_tokens,
      total_tokens, provider_cost, completed_at
    ) VALUES (
      ${attempt.id}, 'succeeded', ${attempt.provider}, ${attempt.model}, ${attempt.promptVersion},
      ${attempt.latencyMs}, ${attempt.inputCharacterCount}, ${attempt.existingTagCount},
      ${attempt.generatedTitleFingerprint}, ${attempt.generatedTagFingerprints},
      ${attempt.generatedTagCount}, ${attempt.vocabularyReuseCount}, ${attempt.usage.promptTokens},
      ${attempt.usage.completionTokens}, ${attempt.usage.totalTokens},
      ${attempt.usage.providerCost}, now()
    )
    ON CONFLICT (id) DO UPDATE SET
      status = EXCLUDED.status,
      provider = EXCLUDED.provider,
      model = EXCLUDED.model,
      prompt_version = EXCLUDED.prompt_version,
      error_code = NULL,
      latency_ms = EXCLUDED.latency_ms,
      input_character_count = EXCLUDED.input_character_count,
      existing_tag_count = EXCLUDED.existing_tag_count,
      generated_title_fingerprint = EXCLUDED.generated_title_fingerprint,
      generated_tag_fingerprints = EXCLUDED.generated_tag_fingerprints,
      generated_tag_count = EXCLUDED.generated_tag_count,
      vocabulary_reuse_count = EXCLUDED.vocabulary_reuse_count,
      prompt_tokens = EXCLUDED.prompt_tokens,
      completion_tokens = EXCLUDED.completion_tokens,
      total_tokens = EXCLUDED.total_tokens,
      provider_cost = EXCLUDED.provider_cost,
      completed_at = EXCLUDED.completed_at
  `;
}

export async function recordEnrichmentAttemptFailed(
  attempt: EnrichmentAttemptFailed,
): Promise<void> {
  const sql = getSql();
  await sql`
    INSERT INTO analytics_ai_enrichment_attempts (
      id, status, provider, model, prompt_version, error_code, latency_ms,
      input_character_count, existing_tag_count, prompt_tokens, completion_tokens,
      total_tokens, provider_cost, completed_at
    ) VALUES (
      ${attempt.id}, 'failed', ${attempt.provider}, ${attempt.model}, ${attempt.promptVersion},
      ${attempt.errorCode}, ${attempt.latencyMs}, ${attempt.inputCharacterCount},
      ${attempt.existingTagCount}, ${attempt.usage.promptTokens},
      ${attempt.usage.completionTokens}, ${attempt.usage.totalTokens},
      ${attempt.usage.providerCost}, now()
    )
    ON CONFLICT (id) DO UPDATE SET
      status = EXCLUDED.status,
      provider = EXCLUDED.provider,
      model = EXCLUDED.model,
      prompt_version = EXCLUDED.prompt_version,
      error_code = EXCLUDED.error_code,
      latency_ms = EXCLUDED.latency_ms,
      input_character_count = EXCLUDED.input_character_count,
      existing_tag_count = EXCLUDED.existing_tag_count,
      generated_title_fingerprint = NULL,
      generated_tag_fingerprints = NULL,
      generated_tag_count = NULL,
      vocabulary_reuse_count = NULL,
      prompt_tokens = EXCLUDED.prompt_tokens,
      completion_tokens = EXCLUDED.completion_tokens,
      total_tokens = EXCLUDED.total_tokens,
      provider_cost = EXCLUDED.provider_cost,
      completed_at = EXCLUDED.completed_at
  `;
}

type AttemptFingerprintRow = {
  id: string;
  status: "started" | "succeeded" | "failed";
  generated_title_fingerprint: string | null;
  generated_tag_fingerprints: string[] | null;
  generated_tag_count: number | null;
};

const REVIEW_ATTEMPT_RETRY_DELAYS_MS = [0, 25, 100, 250, 500] as const;

async function findCompletedAttempt(
  sql: ReturnType<typeof postgres>,
  attemptId: string,
): Promise<AttemptFingerprintRow | undefined> {
  let attempt: AttemptFingerprintRow | undefined;

  for (const delayMs of REVIEW_ATTEMPT_RETRY_DELAYS_MS) {
    if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
    [attempt] = await sql<AttemptFingerprintRow[]>`
      SELECT id, status, generated_title_fingerprint, generated_tag_fingerprints,
        generated_tag_count
      FROM analytics_ai_enrichment_attempts
      WHERE id = ${attemptId}
    `;
    if (attempt && attempt.status !== "started") return attempt;
  }

  return attempt;
}

export async function recordEnrichmentReview(job: EnrichmentReviewJob): Promise<void> {
  const sql = getSql();
  const attempt = job.attemptId ? await findCompletedAttempt(sql, job.attemptId) : undefined;

  const comparesAiResult = job.resultSource !== "fallback";
  const titleExactMatch =
    comparesAiResult && attempt?.generated_title_fingerprint && job.finalTitleFingerprint
      ? attempt.generated_title_fingerprint === job.finalTitleFingerprint
      : null;
  const tagMetrics =
    comparesAiResult && attempt?.generated_tag_fingerprints && job.finalTagFingerprints
      ? compareTagFingerprints(attempt.generated_tag_fingerprints, job.finalTagFingerprints)
      : null;
  const generatedTagCount = comparesAiResult ? (attempt?.generated_tag_count ?? null) : null;

  await sql`
    INSERT INTO analytics_ai_enrichment_reviews (
      id, attempt_id, card_id, result_source, title_exact_match, generated_tag_count,
      final_tag_count, retained_tag_count, removed_tag_count, added_tag_count,
      review_duration_ms
    ) VALUES (
      ${job.id}, ${attempt?.id ?? null}, ${job.cardId}, ${job.resultSource}, ${titleExactMatch},
      ${generatedTagCount}, ${job.finalTagCount}, ${tagMetrics?.retainedTagCount ?? null},
      ${tagMetrics?.removedTagCount ?? null}, ${tagMetrics?.addedTagCount ?? null},
      ${job.reviewDurationMs}
    )
    ON CONFLICT (card_id) DO UPDATE SET
      attempt_id = EXCLUDED.attempt_id,
      result_source = EXCLUDED.result_source,
      title_exact_match = EXCLUDED.title_exact_match,
      generated_tag_count = EXCLUDED.generated_tag_count,
      final_tag_count = EXCLUDED.final_tag_count,
      retained_tag_count = EXCLUDED.retained_tag_count,
      removed_tag_count = EXCLUDED.removed_tag_count,
      added_tag_count = EXCLUDED.added_tag_count,
      review_duration_ms = EXCLUDED.review_duration_ms
  `;
}
