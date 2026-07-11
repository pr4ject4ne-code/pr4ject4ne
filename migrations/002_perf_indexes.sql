-- Racoon Eye v1 — composite indexes for the hot public directory queries (CR2a).
-- Reversible: see migrations/002_perf_indexes.down.sql for rollback.

BEGIN;

-- Mirrors GET /api/hospitals:
--   WHERE status = 'approved' ... ORDER BY verified DESC, rating_avg DESC, name ASC
CREATE INDEX idx_hospitals_directory
  ON hospitals (status, verified DESC, rating_avg DESC, name ASC);

-- Mirrors GET /api/first-aid/entries:
--   WHERE category = $1 ... ORDER BY title ASC
-- Supersedes idx_first_aid_category for this query shape (that single-column
-- index is kept for other category-only lookups).
CREATE INDEX idx_first_aid_directory
  ON first_aid_entries (category, title ASC);

COMMIT;
