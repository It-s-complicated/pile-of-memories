BEGIN;

-- Seed only on first creation: rerunning migrations must not resurrect deleted labels.
DO $seed$
BEGIN
  IF to_regclass('public.memory_labels') IS NULL THEN
    CREATE TABLE memory_labels (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      name text NOT NULL CHECK (name = btrim(name) AND length(name) BETWEEN 1 AND 40),
      kind text NOT NULL CHECK (kind IN ('tag', 'topic')),
      description text NOT NULL DEFAULT '' CHECK (length(description) <= 1000)
    );
    CREATE UNIQUE INDEX memory_labels_name_unique ON memory_labels (lower(name));

    INSERT INTO memory_labels (name, kind, description) VALUES
      ('Web development', 'tag', 'For this board, Web development includes creating, maintaining, or deploying websites and web applications'),
      ('Job', 'tag', 'For this board, Job includes work, careers, professional roles, and approaches to doing good work; it is not limited to job searching or employment changes.'),
      ('Personal development', 'tag', 'For this board, Personal development includes growth in skills, attitudes, mindset, self-improvement, and curiosity; it is not limited to formal training.'),
      ('Project', 'tag', 'For this board, Project includes a specific planned or ongoing undertaking, its goals, progress, or implementation; general observations about work alone do not qualify.'),
      ('AI', 'topic', 'Artificial intelligence, language models, AI assistants, and their capabilities or use.'),
      ('Local-first', 'topic', 'Software that keeps data on the user''s device and works offline, with optional synchronization.'),
      ('CSS', 'topic', 'CSS styling, layout, and presentation of web pages.'),
      ('Hosting', 'topic', 'Deploying and operating software on servers or hosting platforms.'),
      ('Vue', 'topic', 'Building software with the Vue JavaScript framework and its ecosystem.'),
      ('React', 'topic', 'Building software with the React JavaScript library and its ecosystem.'),
      ('Finance', 'topic', 'Money, budgeting, saving, investing, and financial decisions.');

    -- Preserve custom labels and their existing type, including those on archived cards.
    INSERT INTO memory_labels (name, kind)
    SELECT DISTINCT ON (lower(name)) name, kind
    FROM (
      SELECT btrim(unnest(tags)) AS name, 'tag' AS kind FROM cards
      UNION ALL
      SELECT btrim(unnest(topics)) AS name, 'topic' AS kind FROM cards
    ) existing
    WHERE name <> ''
    ORDER BY lower(name), kind, name
    ON CONFLICT DO NOTHING;
  END IF;
END
$seed$;

CREATE OR REPLACE FUNCTION normalize_card_labels() RETURNS trigger
LANGUAGE plpgsql AS $function$
DECLARE missing_label text;
BEGIN
  -- Hold matching definitions through the write so rename/delete cannot race a card save.
  PERFORM id FROM memory_labels
  WHERE lower(name) IN (SELECT lower(btrim(value)) FROM unnest(NEW.tags || NEW.topics) AS value)
  ORDER BY id FOR SHARE;

  SELECT value INTO missing_label FROM unnest(NEW.tags || NEW.topics) AS value
  WHERE NOT EXISTS (SELECT 1 FROM memory_labels WHERE lower(name) = lower(btrim(value)))
  LIMIT 1;
  IF missing_label IS NOT NULL THEN
    RAISE EXCEPTION 'Unknown tag or topic. Reload the vocabulary before saving.'
      USING ERRCODE = '23503';
  END IF;

  SELECT
    coalesce(array_agg(name ORDER BY first_position) FILTER (WHERE kind = 'tag'), '{}'::text[]),
    coalesce(array_agg(name ORDER BY first_position) FILTER (WHERE kind = 'topic'), '{}'::text[])
  INTO NEW.tags, NEW.topics
  FROM (
    SELECT label.name, label.kind, min(position) AS first_position
    FROM unnest(NEW.tags || NEW.topics) WITH ORDINALITY AS requested(value, position)
    JOIN memory_labels label ON lower(label.name) = lower(btrim(requested.value))
    GROUP BY label.id, label.name, label.kind
  ) canonical;

  IF cardinality(NEW.tags) + cardinality(NEW.topics) > 200 THEN
    RAISE EXCEPTION 'Too many tags and topics' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$function$;

DROP TRIGGER IF EXISTS cards_normalize_labels ON cards;
CREATE TRIGGER cards_normalize_labels
BEFORE INSERT OR UPDATE OF tags, topics ON cards
FOR EACH ROW EXECUTE FUNCTION normalize_card_labels();

CREATE OR REPLACE FUNCTION synchronize_card_labels() RETURNS trigger
LANGUAGE plpgsql AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    UPDATE cards SET
      tags = array_remove(tags, OLD.name),
      topics = array_remove(topics, OLD.name),
      updated_at = now()
    WHERE OLD.name = ANY(tags || topics);
  ELSIF NEW.name IS DISTINCT FROM OLD.name OR NEW.kind IS DISTINCT FROM OLD.kind THEN
    UPDATE cards SET
      tags = array_replace(tags, OLD.name, NEW.name),
      topics = array_replace(topics, OLD.name, NEW.name),
      updated_at = now()
    WHERE OLD.name = ANY(tags || topics);
  END IF;
  RETURN NULL;
END
$function$;

DROP TRIGGER IF EXISTS memory_labels_assignments ON memory_labels;
CREATE TRIGGER memory_labels_assignments
AFTER UPDATE OR DELETE ON memory_labels
FOR EACH ROW EXECUTE FUNCTION synchronize_card_labels();

DROP TRIGGER IF EXISTS memory_labels_changed ON memory_labels;
CREATE TRIGGER memory_labels_changed
AFTER INSERT OR UPDATE OR DELETE ON memory_labels
FOR EACH STATEMENT EXECUTE FUNCTION notify_cards_changed();

-- Canonicalize legacy assignments once (this does not alter card content or timestamps).
UPDATE cards SET tags = tags, topics = topics;

ALTER TABLE memory_labels ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE memory_labels FROM PUBLIC;
DO $access$
DECLARE api_role text;
BEGIN
  FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
      EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE memory_labels FROM %I', api_role);
    END IF;
  END LOOP;
END
$access$;

COMMIT;
