BEGIN;

CREATE TABLE IF NOT EXISTS analytics_ai_enrichment_attempts (
  id uuid PRIMARY KEY,
  status text NOT NULL CHECK (status IN ('started', 'succeeded', 'failed')),
  provider text NOT NULL,
  model text NOT NULL,
  prompt_version text NOT NULL,
  error_code text NULL CHECK (
    error_code IS NULL OR error_code IN (
      'configuration_missing', 'provider_timeout', 'provider_rejected',
      'invalid_provider_json', 'invalid_provider_output', 'unknown'
    )
  ),
  latency_ms integer NULL CHECK (latency_ms >= 0),
  input_character_count integer NOT NULL CHECK (input_character_count >= 0),
  existing_tag_count integer NOT NULL CHECK (existing_tag_count >= 0),
  generated_title_fingerprint text NULL,
  generated_tag_fingerprints text[] NULL,
  generated_tag_count integer NULL CHECK (generated_tag_count >= 0),
  vocabulary_reuse_count integer NULL CHECK (vocabulary_reuse_count >= 0),
  prompt_tokens integer NULL CHECK (prompt_tokens >= 0),
  completion_tokens integer NULL CHECK (completion_tokens >= 0),
  total_tokens integer NULL CHECK (total_tokens >= 0),
  provider_cost numeric NULL CHECK (provider_cost >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz NULL,
  CHECK ((status = 'failed') = (error_code IS NOT NULL)),
  CHECK ((status = 'started') = (completed_at IS NULL))
);

CREATE TABLE IF NOT EXISTS analytics_ai_enrichment_reviews (
  id uuid PRIMARY KEY,
  attempt_id uuid NULL REFERENCES analytics_ai_enrichment_attempts(id) ON DELETE SET NULL,
  card_id uuid NULL REFERENCES cards(id) ON DELETE SET NULL,
  result_source text NOT NULL CHECK (result_source IN ('ai', 'cache', 'fallback')),
  title_exact_match boolean NULL,
  generated_tag_count integer NULL CHECK (generated_tag_count >= 0),
  final_tag_count integer NOT NULL CHECK (final_tag_count >= 0),
  retained_tag_count integer NULL CHECK (retained_tag_count >= 0),
  removed_tag_count integer NULL CHECK (removed_tag_count >= 0),
  added_tag_count integer NULL CHECK (added_tag_count >= 0),
  review_duration_ms integer NULL CHECK (review_duration_ms >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (card_id),
  CHECK (
    result_source <> 'fallback' OR
    (title_exact_match IS NULL AND generated_tag_count IS NULL AND
     retained_tag_count IS NULL AND removed_tag_count IS NULL AND added_tag_count IS NULL)
  ),
  CHECK (
    generated_tag_count IS NULL OR retained_tag_count IS NULL OR removed_tag_count IS NULL OR
    generated_tag_count = retained_tag_count + removed_tag_count
  ),
  CHECK (
    retained_tag_count IS NULL OR added_tag_count IS NULL OR
    final_tag_count = retained_tag_count + added_tag_count
  )
);

CREATE OR REPLACE VIEW analytics_ai_enrichment_daily_attempts
WITH (security_invoker = true) AS
SELECT
  created_at::date AS day,
  count(*) AS attempts,
  count(*) FILTER (WHERE status = 'succeeded') AS successes,
  count(*) FILTER (WHERE status = 'failed') AS failures,
  count(*) FILTER (WHERE status = 'started') AS in_progress,
  count(*) FILTER (WHERE status = 'succeeded')::numeric /
    NULLIF(count(*) FILTER (WHERE status IN ('succeeded', 'failed')), 0) AS success_rate
FROM analytics_ai_enrichment_attempts
GROUP BY created_at::date;

CREATE OR REPLACE VIEW analytics_ai_enrichment_failure_counts
WITH (security_invoker = true) AS
SELECT error_code, count(*) AS failures
FROM analytics_ai_enrichment_attempts
WHERE status = 'failed'
GROUP BY error_code;

CREATE OR REPLACE VIEW analytics_ai_enrichment_latency
WITH (security_invoker = true) AS
SELECT
  provider,
  model,
  prompt_version,
  percentile_cont(0.5) WITHIN GROUP (ORDER BY latency_ms) AS median_latency_ms,
  percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms) AS p95_latency_ms
FROM analytics_ai_enrichment_attempts
WHERE latency_ms IS NOT NULL
GROUP BY provider, model, prompt_version;

CREATE OR REPLACE VIEW analytics_ai_enrichment_daily_usage
WITH (security_invoker = true) AS
SELECT
  created_at::date AS day,
  sum(prompt_tokens) AS prompt_tokens,
  sum(completion_tokens) AS completion_tokens,
  sum(total_tokens) AS total_tokens,
  sum(provider_cost) AS provider_cost
FROM analytics_ai_enrichment_attempts
GROUP BY created_at::date;

CREATE OR REPLACE VIEW analytics_ai_enrichment_review_sources
WITH (security_invoker = true) AS
SELECT result_source, count(*) AS saved_reviews
FROM analytics_ai_enrichment_reviews
GROUP BY result_source;

CREATE OR REPLACE VIEW analytics_ai_enrichment_acceptance
WITH (security_invoker = true) AS
SELECT
  attempts.prompt_version,
  avg(reviews.title_exact_match::integer) AS exact_title_acceptance,
  avg(
    reviews.retained_tag_count::numeric / NULLIF(reviews.generated_tag_count, 0)
  ) AS generated_tag_acceptance,
  avg(
    reviews.retained_tag_count::numeric / NULLIF(reviews.final_tag_count, 0)
  ) AS final_tag_coverage,
  avg(reviews.added_tag_count) AS average_added_tag_count,
  avg(reviews.removed_tag_count) AS average_removed_tag_count
FROM analytics_ai_enrichment_reviews AS reviews
JOIN analytics_ai_enrichment_attempts AS attempts ON attempts.id = reviews.attempt_id
WHERE reviews.result_source IN ('ai', 'cache')
GROUP BY attempts.prompt_version;

ALTER TABLE analytics_ai_enrichment_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_ai_enrichment_reviews ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE
  analytics_ai_enrichment_attempts,
  analytics_ai_enrichment_reviews,
  analytics_ai_enrichment_daily_attempts,
  analytics_ai_enrichment_failure_counts,
  analytics_ai_enrichment_latency,
  analytics_ai_enrichment_daily_usage,
  analytics_ai_enrichment_review_sources,
  analytics_ai_enrichment_acceptance
FROM PUBLIC;

DO $analytics_access$
DECLARE api_role text;
BEGIN
  FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
      EXECUTE format(
        'REVOKE ALL PRIVILEGES ON TABLE analytics_ai_enrichment_attempts, analytics_ai_enrichment_reviews, analytics_ai_enrichment_daily_attempts, analytics_ai_enrichment_failure_counts, analytics_ai_enrichment_latency, analytics_ai_enrichment_daily_usage, analytics_ai_enrichment_review_sources, analytics_ai_enrichment_acceptance FROM %I',
        api_role
      );
    END IF;
  END LOOP;
END
$analytics_access$;

COMMIT;
