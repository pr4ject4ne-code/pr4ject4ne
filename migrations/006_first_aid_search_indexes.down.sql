-- Rollback for 006_first_aid_search_indexes.sql.

BEGIN;

DROP INDEX IF EXISTS idx_first_aid_dos_trgm;
DROP INDEX IF EXISTS idx_first_aid_donts_trgm;
DROP INDEX IF EXISTS idx_first_aid_implications_trgm;
DROP INDEX IF EXISTS idx_first_aid_indication_trgm;
DROP INDEX IF EXISTS idx_first_aid_contraindications_trgm;
DROP INDEX IF EXISTS idx_first_aid_things_to_look_out_for_trgm;

COMMIT;
