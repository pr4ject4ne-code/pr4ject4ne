-- Migration: create announcements_audit table

CREATE TABLE IF NOT EXISTS announcements_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  announcement_id UUID NOT NULL,
  action TEXT NOT NULL, -- e.g. 'created','updated','deleted','dismissed'
  actor_id UUID NULL,
  actor_ip TEXT NULL,
  details JSONB NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  FOREIGN KEY (announcement_id) REFERENCES announcements(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_announcements_audit_announcement_id ON announcements_audit(announcement_id);
CREATE INDEX IF NOT EXISTS idx_announcements_audit_action ON announcements_audit(action);
CREATE INDEX IF NOT EXISTS idx_announcements_audit_created_at ON announcements_audit(created_at);
