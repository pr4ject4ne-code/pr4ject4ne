-- Racoon Eye — doctor contact info (worklist #29's signature-block support).
--
-- The report generator (src/lib/doctor-report.ts) needs a doctor's contact
-- detail to populate the "name/contact" signature block, but `doctors`
-- (migration 001) had no contact field at all — only name/specialty/level.
-- Adds two nullable columns (mirrors hospitals.contact_phone/contact_email's
-- naming, migration 001) so a doctor's contact can be recorded once, at
-- consent-recording time or via the hospital portal's personnel editor,
-- without inventing a new shape. Both nullable: most doctors will never need
-- this until/unless they are actually credited AND approved in a report.
--
-- Reversible: see migrations/015_doctor_contact_info.down.sql.

BEGIN;

ALTER TABLE doctors
  ADD COLUMN IF NOT EXISTS contact_phone TEXT,
  ADD COLUMN IF NOT EXISTS contact_email TEXT;

COMMIT;
