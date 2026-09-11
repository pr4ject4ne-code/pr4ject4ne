-- Racoon Eye — item 8: "association ranking" — a hospital can request an
-- official review after disputing a rating; a developer (acting as the
-- association reviewer — no separate association account type, per the
-- founder's explicit direction: "within the app through the admin") issues
-- an official score + a released statement, which then becomes the
-- hospital's DISPLAYED/ranked figure instead of the raw community
-- (general+in-depth) blend.
--
-- Append-only (same "most recent row wins" pattern as
-- doctor_consent_records, migration 014): a hospital can be re-reviewed
-- later, and the history of past association statements stays intact
-- rather than being overwritten — a released statement is exactly the kind
-- of thing that shouldn't quietly disappear.
--
-- `hospitals.association_score` is a denormalized cache of the LATEST
-- association_rankings row's score, kept in sync at write time by
-- application code (src/lib/association-rankings.ts) — same
-- cache-column pattern as `hospitals.rating_avg` itself (migration 001) and
-- for the same reason: hospital-filters.ts needs a plain column to sort/
-- filter on, not a subquery per row. NULL means "no association ranking has
-- ever been issued" — the community blend is used instead
-- (src/lib/rating-scoring.ts effectiveHospitalScore).

BEGIN;

CREATE TABLE association_rankings (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id      UUID NOT NULL REFERENCES hospitals (id) ON DELETE CASCADE,
  score            NUMERIC(3,2) NOT NULL CHECK (score BETWEEN 0 AND 5),
  statement        TEXT NOT NULL,
  issued_by_dev_id UUID REFERENCES users (id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_association_rankings_hospital ON association_rankings (hospital_id, created_at DESC);

ALTER TABLE hospitals ADD COLUMN association_score NUMERIC(3,2) NULL;

COMMIT;
