-- Rollback for 001_initial_schema.sql
BEGIN;

DROP TABLE IF EXISTS rate_limit_events;
DROP TABLE IF EXISTS audit_logs;
DROP TABLE IF EXISTS sessions;
DROP TABLE IF EXISTS suggestions;
DROP TABLE IF EXISTS first_aid_entries;
DROP TABLE IF EXISTS biodata;
DROP TABLE IF EXISTS doctors;
DROP TABLE IF EXISTS announcements;

-- Drop the FK added onto users before dropping hospitals.
ALTER TABLE IF EXISTS users DROP CONSTRAINT IF EXISTS users_hospital_fk;
DROP TABLE IF EXISTS hospitals;
DROP TABLE IF EXISTS users;

COMMIT;
