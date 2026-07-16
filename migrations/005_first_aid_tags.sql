-- Topic/scenario tags for first-aid entries: a second categorization axis on top
-- of procedure/technique, used for filtering and search (e.g. Bleeding, Burns,
-- Choking). Stored as a text[] of whitelisted tag labels (validated in app code).
ALTER TABLE first_aid_entries ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}';

-- GIN index for fast containment (@>) filtering by tag.
CREATE INDEX IF NOT EXISTS idx_first_aid_tags ON first_aid_entries USING GIN (tags);
