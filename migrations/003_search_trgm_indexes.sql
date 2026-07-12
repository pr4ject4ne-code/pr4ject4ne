-- Racoon Eye v1 — trigram GIN indexes for the public keyword searches (CR2b).
--
-- The public directory and first-aid searches use leading-wildcard ILIKE
-- ('%term%'), which a btree index cannot serve — every unauthenticated search
-- was a sequential scan (a cheap DoS lever as the tables grow, and `address`
-- had no index at all). pg_trgm GIN indexes make these ILIKE filters index-backed.
--
-- Reversible: see migrations/003_search_trgm_indexes.down.sql for rollback.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Mirrors GET /api/hospitals: name ILIKE, and (city ILIKE OR address ILIKE).
CREATE INDEX IF NOT EXISTS idx_hospitals_name_trgm
  ON hospitals USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_hospitals_city_trgm
  ON hospitals USING gin (city gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_hospitals_address_trgm
  ON hospitals USING gin (address gin_trgm_ops);

-- Mirrors GET /api/first-aid/entries: title ILIKE OR definition ILIKE.
CREATE INDEX IF NOT EXISTS idx_first_aid_title_trgm
  ON first_aid_entries USING gin (title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_first_aid_definition_trgm
  ON first_aid_entries USING gin (definition gin_trgm_ops);

COMMIT;
