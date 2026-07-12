-- Rollback for 003_search_trgm_indexes.sql.
-- Leaves the pg_trgm extension in place (other objects may depend on it).

BEGIN;

DROP INDEX IF EXISTS idx_hospitals_name_trgm;
DROP INDEX IF EXISTS idx_hospitals_city_trgm;
DROP INDEX IF EXISTS idx_hospitals_address_trgm;
DROP INDEX IF EXISTS idx_first_aid_title_trgm;
DROP INDEX IF EXISTS idx_first_aid_definition_trgm;

COMMIT;
