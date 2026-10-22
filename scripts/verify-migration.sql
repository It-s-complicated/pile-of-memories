-- Read-only comparison of every application table, including authentication and analytics.
-- Run against the frozen source and restored target with the same PostgreSQL client.
BEGIN READ ONLY;
SET LOCAL TIME ZONE 'UTC';

SELECT 'account' AS table_name, count(*) AS rows,
  md5(coalesce(string_agg(md5(to_jsonb(t)::text), '' ORDER BY id::text COLLATE "C"), '')) AS fingerprint
FROM public.account AS t
UNION ALL
SELECT 'analytics_ai_enrichment_attempts', count(*),
  md5(coalesce(string_agg(md5(to_jsonb(t)::text), '' ORDER BY id::text COLLATE "C"), ''))
FROM public.analytics_ai_enrichment_attempts AS t
UNION ALL
SELECT 'analytics_ai_enrichment_reviews', count(*),
  md5(coalesce(string_agg(md5(to_jsonb(t)::text), '' ORDER BY id::text COLLATE "C"), ''))
FROM public.analytics_ai_enrichment_reviews AS t
UNION ALL
SELECT 'cards', count(*),
  md5(coalesce(string_agg(md5(to_jsonb(t)::text), '' ORDER BY id::text COLLATE "C"), ''))
FROM public.cards AS t
UNION ALL
SELECT 'memory_labels', count(*),
  md5(coalesce(string_agg(md5(to_jsonb(t)::text), '' ORDER BY id::text COLLATE "C"), ''))
FROM public.memory_labels AS t
UNION ALL
SELECT 'session', count(*),
  md5(coalesce(string_agg(md5(to_jsonb(t)::text), '' ORDER BY id::text COLLATE "C"), ''))
FROM public.session AS t
UNION ALL
SELECT 'user', count(*),
  md5(coalesce(string_agg(md5(to_jsonb(t)::text), '' ORDER BY id::text COLLATE "C"), ''))
FROM public."user" AS t
UNION ALL
SELECT 'verification', count(*),
  md5(coalesce(string_agg(md5(to_jsonb(t)::text), '' ORDER BY id::text COLLATE "C"), ''))
FROM public.verification AS t
ORDER BY table_name;

COMMIT;
