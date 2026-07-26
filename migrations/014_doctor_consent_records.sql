-- Racoon Eye — doctor consent records (worklist #30).
--
-- Item #30 exists because attributing a piece of biodata to a named doctor
-- WITHOUT that doctor's explicit, contacted, recorded consent is a real-world
-- liability risk (misattribution). Per the pre-authorized scope decision in
-- PLAN-worklist.md, there is no doctor-account/login concept anywhere in this
-- schema (the `doctors` table, migration 001, is a read-only hospital-roster
-- row with no `user_id`/auth) — building a full doctor self-serve consent
-- portal is out of scope for this task. Instead: an ADMIN-RECORDED process —
-- a developer (primary or secondary) manually records the outcome of
-- contacting a doctor out-of-band (phone/email, outside this app) via the
-- dev portal (see src/app/dev/doctor-consent).
--
-- `consent_status` is a CHECK-constrained enum, matching this project's
-- existing enum style (e.g. hospitals.service_type, migration 001):
--   pending   — doctor has been contacted, outcome not yet decided
--   approved  — doctor explicitly consented to name/contact attribution
--   denied    — doctor explicitly declined
--
-- A doctor with NO row at all is implicitly "not yet contacted" / not
-- consented — the SAME default-deny spirit as #23's sharing_prefs. This is
-- deliberately NOT enforced by defaulting every doctor to a row; absence IS
-- the not-consented state, checked by application code (never inferred from
-- a missing-row special case being treated as anything other than deny).
--
-- Multiple rows per doctor are allowed (a re-contact attempt, or a status
-- change over time) — the CURRENT status for a doctor is the most recent row
-- by created_at, which src/lib/doctor-consent-db.ts's queries always derive
-- via ORDER BY created_at DESC LIMIT 1, never by mutating history in place.
--
-- Reversible: see migrations/014_doctor_consent_records.down.sql.

BEGIN;

CREATE TABLE doctor_consent_records (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id           UUID NOT NULL REFERENCES doctors (id) ON DELETE CASCADE,
  consent_status      TEXT NOT NULL CHECK (consent_status IN ('pending', 'approved', 'denied')),
  contacted_via       TEXT,
  denial_reason       TEXT,
  recorded_by_dev_id  UUID REFERENCES users (id) ON DELETE SET NULL,
  decided_at          TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_doctor_consent_records_doctor ON doctor_consent_records (doctor_id, created_at DESC);

COMMIT;
