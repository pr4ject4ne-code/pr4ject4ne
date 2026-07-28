-- Racoon Eye — patient personal reminders on their own dashboard calendar
-- (founder ask: "Allow users to set reminders on calendar" — not a numbered
-- worklist item).
--
-- Deliberately simple: "set a reminder for a date (and optionally a time)",
-- NOT a recurring-event/RRULE system. Scope decision (documented here and in
-- the shipping commit message): reminders are STORED and DISPLAYED only —
-- no push/email delivery and no background scheduler/cron, since this
-- project has no job-scheduling infrastructure and building one is a much
-- larger feature than "let users set reminders on calendar".
--
-- Strictly owner-scoped: unlike biodata's IHN-code sharing model, a
-- reminder always belongs to exactly one patient (`user_id`) and is never
-- cross-user readable — every API route must filter by the caller's own
-- session user_id (see src/app/api/reminders/).
--
-- Reversible: see migrations/017_reminders.down.sql.

BEGIN;

CREATE TABLE reminders (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  note        TEXT,
  remind_at   TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Owner's own reminder list is always fetched sorted by date — composite
-- index keeps that a fast index scan instead of a per-user seq scan.
CREATE INDEX idx_reminders_user_remind_at ON reminders (user_id, remind_at);

COMMIT;
