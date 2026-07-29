BEGIN;

ALTER TABLE biodata DROP COLUMN ihn_code_regenerated_at;

COMMIT;
