-- Racoon Eye v1 — trigram GIN indexes for the remaining first-aid search columns.
--
-- Commit 05680ce added dos, donts, implications, indication, contraindications,
-- and things_to_look_out_for to the public ILIKE search in
-- src/app/api/first-aid/entries/route.ts, but 003_search_trgm_indexes.sql only
-- indexed title/definition. An OR across indexed and unindexed columns forces a
-- sequential scan on the unindexed ones. This migration closes that gap.
--
-- Reversible: see migrations/006_first_aid_search_indexes.down.sql for rollback.

BEGIN;

CREATE INDEX IF NOT EXISTS idx_first_aid_dos_trgm
  ON first_aid_entries USING gin (dos gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_first_aid_donts_trgm
  ON first_aid_entries USING gin (donts gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_first_aid_implications_trgm
  ON first_aid_entries USING gin (implications gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_first_aid_indication_trgm
  ON first_aid_entries USING gin (indication gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_first_aid_contraindications_trgm
  ON first_aid_entries USING gin (contraindications gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_first_aid_things_to_look_out_for_trgm
  ON first_aid_entries USING gin (things_to_look_out_for gin_trgm_ops);

COMMIT;
