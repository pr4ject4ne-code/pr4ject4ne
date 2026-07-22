-- Racoon Eye — per-hospital "show doctors" toggle (worklist #10).
--
-- Pharmacies and other non-doctor-bearing institutions shouldn't show a
-- doctors section by default, but a verified account that genuinely does
-- have staff doctors needs to be able to switch it back on. A type-based
-- rule alone (hide for pharmacy/radiology) can't express that opt-back-in,
-- so this is an explicit per-hospital boolean the institution controls via
-- its own portal (PATCH /api/hospital/[id]/info), not an inferred rule
-- derived from service_type at render time.
--
-- Column default is TRUE (new hospitals of any service_type start with the
-- section visible) — combined with the existing "no doctors listed"
-- empty-state and HospitalProfileClient's doctors.length>0 render gate, an
-- institution with zero doctors never actually shows an empty section
-- regardless of this flag, so a permissive default is safe.
--
-- Existing rows are backfilled explicitly rather than relying on the column
-- default, so already-seeded/registered hospital and clinic rows keep
-- showing their real doctor rosters unchanged, while non-doctor-typed rows
-- (e.g. the seeded "HealthPlus Pharmacy", which has zero doctors in
-- scripts/seed.ts) start hidden until/unless verified staff opt back in.
--
-- Reversible: see migrations/007_hospital_show_doctors.down.sql for rollback.

BEGIN;

ALTER TABLE hospitals ADD COLUMN IF NOT EXISTS show_doctors BOOLEAN NOT NULL DEFAULT true;

UPDATE hospitals SET show_doctors = (service_type IN ('hospital', 'clinic'));

COMMIT;
