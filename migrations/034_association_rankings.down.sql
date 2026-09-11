BEGIN;
ALTER TABLE hospitals DROP COLUMN IF EXISTS association_score;
DROP TABLE IF EXISTS association_rankings;
COMMIT;
