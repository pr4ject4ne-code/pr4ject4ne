-- 024_announcements.sql — create announcements table

BEGIN;

-- Up
CREATE TABLE IF NOT EXISTS announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  start_at TIMESTAMP WITH TIME ZONE NOT NULL,
  end_at TIMESTAMP WITH TIME ZONE NOT NULL,
  recurrence_rule TEXT NULL, -- simple RRULE-like string or JSON, optional
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  scheduled_at TIMESTAMP WITH TIME ZONE NULL
);

CREATE INDEX IF NOT EXISTS announcements_start_idx ON announcements (start_at);
CREATE INDEX IF NOT EXISTS announcements_end_idx ON announcements (end_at);

COMMIT;

-- Down
-- DROP TABLE announcements;
