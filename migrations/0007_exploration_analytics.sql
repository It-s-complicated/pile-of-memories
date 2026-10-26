BEGIN;

ALTER TABLE analytics_ai_enrichment_attempts ADD COLUMN IF NOT EXISTS title_source text NOT NULL DEFAULT 'generated'
  CHECK (title_source IN ('generated', 'supplied'));

CREATE TABLE IF NOT EXISTS analytics_ai_exploration_runs (
  id uuid PRIMARY KEY,
  session_id uuid NOT NULL,
  operation text NOT NULL CHECK (operation IN ('related', 'reflection')),
  status text NOT NULL CHECK (status IN ('started', 'succeeded', 'failed')),
  provider text NOT NULL,
  model text NOT NULL,
  prompt_version text NOT NULL DEFAULT 'exploration-v1',
  selected_card_count integer NOT NULL CHECK (selected_card_count BETWEEN 1 AND 8),
  question_character_count integer NOT NULL CHECK (question_character_count BETWEEN 0 AND 1000),
  candidate_count integer NULL CHECK (candidate_count >= 0),
  suggestion_count integer NULL CHECK (suggestion_count >= 0),
  observation_count integer NULL CHECK (observation_count >= 0),
  idea_count integer NULL CHECK (idea_count >= 0),
  latency_ms integer NULL CHECK (latency_ms >= 0),
  prompt_tokens integer NULL CHECK (prompt_tokens >= 0),
  completion_tokens integer NULL CHECK (completion_tokens >= 0),
  total_tokens integer NULL CHECK (total_tokens >= 0),
  provider_cost numeric NULL CHECK (provider_cost >= 0),
  error_code text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz NULL,
  CHECK ((status = 'failed') = (error_code IS NOT NULL)),
  CHECK ((status = 'started') = (completed_at IS NULL))
);

CREATE TABLE IF NOT EXISTS analytics_ai_exploration_events (
  id uuid PRIMARY KEY,
  session_id uuid NOT NULL,
  event text NOT NULL CHECK (event IN ('opened', 'closed', 'card_added', 'card_removed', 'draft_selected', 'draft_cancelled', 'idea_saved')),
  run_id uuid NULL REFERENCES analytics_ai_exploration_runs(id) ON DELETE SET NULL,
  card_id uuid NULL REFERENCES cards(id) ON DELETE SET NULL,
  selected_card_count integer NULL CHECK (selected_card_count BETWEEN 0 AND 8),
  selection_source text NULL CHECK (selection_source IN ('suggested', 'manual')),
  idea_index integer NULL CHECK (idea_index BETWEEN 0 AND 2),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE analytics_ai_enrichment_attempts ADD COLUMN IF NOT EXISTS exploration_session_id uuid NULL;
ALTER TABLE analytics_ai_enrichment_attempts ADD COLUMN IF NOT EXISTS exploration_run_id uuid NULL
  REFERENCES analytics_ai_exploration_runs(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS analytics_ai_exploration_runs_session_idx ON analytics_ai_exploration_runs(session_id);
CREATE INDEX IF NOT EXISTS analytics_ai_exploration_events_session_idx ON analytics_ai_exploration_events(session_id);
CREATE UNIQUE INDEX IF NOT EXISTS analytics_ai_exploration_saved_card_idx
  ON analytics_ai_exploration_events(card_id) WHERE event = 'idea_saved';

CREATE OR REPLACE VIEW analytics_ai_exploration_daily
WITH (security_invoker = true) AS
SELECT created_at::date AS day, operation, count(*) AS attempts,
  count(*) FILTER (WHERE status = 'succeeded') AS successes,
  count(*) FILTER (WHERE status = 'failed') AS failures,
  count(*) FILTER (WHERE status = 'started') AS incomplete,
  percentile_cont(0.5) WITHIN GROUP (ORDER BY latency_ms) AS median_latency_ms,
  percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms) AS p95_latency_ms,
  sum(prompt_tokens) AS prompt_tokens, sum(completion_tokens) AS completion_tokens,
  sum(total_tokens) AS total_tokens, sum(provider_cost) AS provider_cost
FROM analytics_ai_exploration_runs GROUP BY created_at::date, operation;

CREATE OR REPLACE VIEW analytics_ai_exploration_funnel
WITH (security_invoker = true) AS
SELECT session_id,
  count(*) FILTER (WHERE event = 'opened') AS opened,
  count(*) FILTER (WHERE event = 'card_added' AND selection_source = 'suggested') AS suggested_cards_added,
  count(*) FILTER (WHERE event = 'card_added' AND selection_source = 'manual') AS manual_cards_added,
  count(*) FILTER (WHERE event = 'draft_selected') AS drafts_selected,
  count(*) FILTER (WHERE event = 'draft_cancelled') AS drafts_cancelled,
  count(*) FILTER (WHERE event = 'idea_saved') AS ideas_saved,
  min(created_at) AS first_event_at, max(created_at) AS last_event_at
FROM analytics_ai_exploration_events GROUP BY session_id;

CREATE OR REPLACE VIEW analytics_ai_enrichment_acceptance
WITH (security_invoker = true) AS
SELECT attempts.prompt_version,
  avg(reviews.title_exact_match::integer) FILTER (WHERE attempts.title_source = 'generated') AS exact_title_acceptance,
  avg(reviews.retained_tag_count::numeric / NULLIF(reviews.generated_tag_count, 0)) AS generated_tag_acceptance,
  avg(reviews.retained_tag_count::numeric / NULLIF(reviews.final_tag_count, 0)) AS final_tag_coverage,
  avg(reviews.added_tag_count) AS average_added_tag_count,
  avg(reviews.removed_tag_count) AS average_removed_tag_count
FROM analytics_ai_enrichment_reviews AS reviews
JOIN analytics_ai_enrichment_attempts AS attempts ON attempts.id = reviews.attempt_id
WHERE reviews.result_source IN ('ai', 'cache') GROUP BY attempts.prompt_version;

ALTER TABLE analytics_ai_exploration_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_ai_exploration_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE analytics_ai_exploration_runs, analytics_ai_exploration_events,
  analytics_ai_exploration_daily, analytics_ai_exploration_funnel FROM PUBLIC;
DO $access$
DECLARE role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE analytics_ai_exploration_runs, analytics_ai_exploration_events, analytics_ai_exploration_daily, analytics_ai_exploration_funnel FROM %I', role_name);
    END IF;
  END LOOP;
END;
$access$;
COMMIT;
