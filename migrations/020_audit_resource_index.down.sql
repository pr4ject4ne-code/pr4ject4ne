-- Rollback for 020_audit_resource_index.sql.

BEGIN;

DROP INDEX IF EXISTS idx_audit_resource;

COMMIT;
