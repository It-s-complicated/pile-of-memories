BEGIN;

CREATE TABLE IF NOT EXISTS cards (
  id uuid PRIMARY KEY,
  title text NOT NULL CHECK (btrim(title) <> ''),
  body text NOT NULL,
  x double precision NOT NULL,
  y double precision NOT NULL,
  tags text[] NOT NULL DEFAULT ARRAY[]::text[],
  topics text[] NOT NULL DEFAULT ARRAY[]::text[],
  links text[] NOT NULL DEFAULT ARRAY[]::text[],
  archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE cards ADD COLUMN IF NOT EXISTS archived boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION notify_cards_changed() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_notify('cards_changed', '');
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS cards_changed ON cards;
CREATE TRIGGER cards_changed
AFTER INSERT OR UPDATE OR DELETE ON cards
FOR EACH STATEMENT EXECUTE FUNCTION notify_cards_changed();

COMMIT;
