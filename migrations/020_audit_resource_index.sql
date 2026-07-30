-- Racoon Eye — index to support the patient-facing IHN access log
-- (GET /api/biodata/access-log).
--
-- That route filters `audit_logs` by `resource_type = 'biodata' AND
-- resource_id = <session.user_id>`, ordered newest-first — exactly the shape
-- this composite index covers (leading equality columns + trailing DESC sort
-- column), so the query can use an index scan instead of falling back to the
-- existing single-column idx_audit_action/idx_audit_user indexes.
--
-- Purely additive: one new index, no data change. Reversible: see
-- migrations/020_audit_resource_index.down.sql.

BEGIN;

CREATE INDEX idx_audit_resource ON audit_logs (resource_type, resource_id, created_at DESC);

COMMIT;
