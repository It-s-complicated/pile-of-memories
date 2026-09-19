ALTER TABLE cards ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'memory'
  CHECK (kind IN ('memory', 'idea', 'note'));
