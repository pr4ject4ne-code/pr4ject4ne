-- Racoon Eye — capture the doctor's email and a signed attestation on each
-- consent record (founder ask, 2026-07-29: "I can't see provision for
-- doctor signature and email to consent").
--
-- This stays within the existing admin-recorded, out-of-band model
-- documented in migration 014 (there is still no doctor-account/login
-- concept — a full doctor self-serve e-signature portal remains out of
-- scope). `doctor_email` and `doctor_signature` just give the recording
-- developer a place to capture WHICH email address the doctor was
-- contacted at and WHAT they sent back as their signed confirmation (e.g.
-- a pasted email reply, a photographed signed form), as evidence attached
-- to that specific consent record.
--
-- `doctor_email` is captured per-record (not read live from `doctors.
-- contact_email`) because a doctor's listed contact email can change after
-- the fact — the record should reflect the address actually used at the
-- time, not whatever the roster says today.
--
-- Reversible: see migrations/019_doctor_consent_signature.down.sql.

BEGIN;

ALTER TABLE doctor_consent_records
  ADD COLUMN doctor_email TEXT,
  ADD COLUMN doctor_signature TEXT;

COMMIT;
