-- Racoon Eye — item 8: a hospital can dispute a specific rating (general OR
-- department/in-depth) as unfair. Exactly one of general_rating_id /
-- department_rating_id is set (CHECK below) — a dispute is always about one
-- specific rating, never "all ratings" in bulk.
--
-- While a dispute is 'pending' or upheld as 'upheld', the disputed rating is
-- EXCLUDED from that hospital's aggregate score (src/lib/rating-scoring.ts) —
-- frozen pending review, not silently still counted. A 'dismissed' dispute
-- lets the rating count again immediately (no application code needs to
-- "restore" anything — the aggregate query simply checks current dispute
-- status live, every time, rather than caching an excluded/included flag
-- that could drift out of sync).
--
-- `hospital_id` is denormalized here (also derivable via a join through
-- whichever rating is referenced) so the admin dispute queue and rate
-- limiting can filter by hospital directly without an extra join — same
-- trade-off migration 014 made for doctor_consent_records.
--
-- Append-only in spirit but not in practice: unlike doctor_consent_records,
-- a dispute genuinely has ONE lifecycle (pending -> dismissed OR upheld) not
-- a series of independent contact attempts, so this one row IS mutated via
-- PATCH — mirroring how hospital_staff account status itself is a mutable
-- row, not an event log.

BEGIN;

CREATE TABLE rating_disputes (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id           UUID NOT NULL REFERENCES hospitals (id) ON DELETE CASCADE,
  general_rating_id     UUID REFERENCES general_ratings (id) ON DELETE CASCADE,
  department_rating_id  UUID REFERENCES department_ratings (id) ON DELETE CASCADE,
  filed_by_user_id      UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  complaint              TEXT NOT NULL,
  status                TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'dismissed', 'upheld')),
  resolved_by_dev_id    UUID REFERENCES users (id) ON DELETE SET NULL,
  resolution_note       TEXT NULL,
  resolved_at           TIMESTAMPTZ NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT rating_disputes_exactly_one_target CHECK (
    (general_rating_id IS NOT NULL)::int + (department_rating_id IS NOT NULL)::int = 1
  )
);

CREATE INDEX idx_rating_disputes_hospital ON rating_disputes (hospital_id);
CREATE INDEX idx_rating_disputes_status ON rating_disputes (status) WHERE status = 'pending';
-- One open dispute per rating at a time — filing a second one before the
-- first resolves would just be noise for the admin queue to sort out.
CREATE UNIQUE INDEX idx_rating_disputes_one_open_general
  ON rating_disputes (general_rating_id) WHERE status = 'pending' AND general_rating_id IS NOT NULL;
CREATE UNIQUE INDEX idx_rating_disputes_one_open_department
  ON rating_disputes (department_rating_id) WHERE status = 'pending' AND department_rating_id IS NOT NULL;

COMMIT;
