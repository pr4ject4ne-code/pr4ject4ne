-- 028_hospital_announcements.sql — dedicated per-hospital announcements table.
--
-- Replaces the broken setup where src/app/api/hospital/[id]/announcements
-- wrote hospital_id/color/event_date/is_bar onto the GLOBAL `announcements`
-- table (created by 024_announcements.sql with a completely different
-- schema: title/body/start_at/end_at/recurrence_rule, no hospital scoping).
-- Every insert/update from that route has been failing at the DB level.
-- The global `announcements` table is untouched — it stays the site-wide
-- banner system and keeps its own audit trail via announcements_audit.

BEGIN;

CREATE TABLE IF NOT EXISTS hospital_announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id UUID NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NULL,
  color TEXT NOT NULL DEFAULT 'green' CHECK (color IN ('green', 'yellow', 'red')),
  event_date DATE NOT NULL,
  is_bar BOOLEAN NOT NULL DEFAULT FALSE,
  -- Recurrence: NULL = one-off. Otherwise 'daily' | 'weekly' | 'monthly' | 'yearly'.
  -- recurrence_interval lets "every 2 weeks" etc. recurrence_end_date is optional;
  -- NULL means the series repeats indefinitely.
  recurrence_freq TEXT NULL CHECK (recurrence_freq IN ('daily', 'weekly', 'monthly', 'yearly')),
  recurrence_interval INTEGER NOT NULL DEFAULT 1 CHECK (recurrence_interval >= 1),
  recurrence_end_date DATE NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS hospital_announcements_hospital_idx ON hospital_announcements (hospital_id);
CREATE INDEX IF NOT EXISTS hospital_announcements_event_date_idx ON hospital_announcements (event_date);

COMMIT;
