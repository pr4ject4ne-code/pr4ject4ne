-- Racoon Eye v1 — initial schema
-- Reversible: see migrations/001_initial_schema.down.sql for rollback.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

-- ---------------------------------------------------------------------------
-- users: patients, hospital staff, and developers share one table, keyed by
-- account_type. Hospital staff link to a hospital; developers carry access_level.
-- ---------------------------------------------------------------------------
CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         CITEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  account_type  TEXT NOT NULL CHECK (account_type IN ('patient', 'hospital_staff', 'developer')),
  -- hospital_staff only:
  hospital_id   UUID,
  verified      BOOLEAN NOT NULL DEFAULT FALSE,
  -- developer only:
  access_level  TEXT,        -- e.g. 'admin', 'first_aid_editor'
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_by    UUID REFERENCES users (id) ON DELETE SET NULL,
  last_login    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- hospitals: verified (account_id set) or community-managed (account_id NULL).
-- ---------------------------------------------------------------------------
CREATE TABLE hospitals (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name           TEXT NOT NULL,
  service_type   TEXT NOT NULL DEFAULT 'hospital'
                   CHECK (service_type IN ('hospital', 'clinic', 'pharmacy', 'radiology', 'other')),
  address        TEXT,
  city           TEXT,
  latitude       DOUBLE PRECISION,
  longitude      DOUBLE PRECISION,
  website        TEXT,
  contact_phone  TEXT,
  contact_email  TEXT,
  logo_url       TEXT,
  photos         JSONB NOT NULL DEFAULT '[]'::jsonb,   -- array of { url, caption, slot }
  hours          JSONB NOT NULL DEFAULT '{}'::jsonb,   -- { mon: "09:00-17:00", ... }
  specialties    TEXT[] NOT NULL DEFAULT '{}',
  rating_avg     NUMERIC(3, 2) NOT NULL DEFAULT 0,
  rating_count   INTEGER NOT NULL DEFAULT 0,
  is_24_hour     BOOLEAN NOT NULL DEFAULT FALSE,
  verified       BOOLEAN NOT NULL DEFAULT FALSE,
  account_id     UUID REFERENCES users (id) ON DELETE SET NULL,   -- NULL = community-managed
  status         TEXT NOT NULL DEFAULT 'approved'
                   CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Give hospital_staff.hospital_id a real FK now that hospitals exists.
ALTER TABLE users
  ADD CONSTRAINT users_hospital_fk
  FOREIGN KEY (hospital_id) REFERENCES hospitals (id) ON DELETE SET NULL;

CREATE INDEX idx_hospitals_city ON hospitals (city);
CREATE INDEX idx_hospitals_service_type ON hospitals (service_type);
CREATE INDEX idx_hospitals_specialties ON hospitals USING GIN (specialties);

-- ---------------------------------------------------------------------------
-- announcements: dated, color-coded, per hospital; one may be the "bar".
-- ---------------------------------------------------------------------------
CREATE TABLE announcements (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id  UUID NOT NULL REFERENCES hospitals (id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  body         TEXT,
  color        TEXT NOT NULL CHECK (color IN ('green', 'yellow', 'red')),
  event_date   DATE,
  is_bar       BOOLEAN NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_announcements_hospital ON announcements (hospital_id);

-- ---------------------------------------------------------------------------
-- doctors: hospital roster with read-only aggregate ratings.
-- ---------------------------------------------------------------------------
CREATE TABLE doctors (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id   UUID NOT NULL REFERENCES hospitals (id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  specialty     TEXT,
  level         TEXT,   -- consultant | senior_registrar | registrar | intern | other
  rating_avg    NUMERIC(3, 2) NOT NULL DEFAULT 0,
  rating_count  INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_doctors_hospital ON doctors (hospital_id);

-- ---------------------------------------------------------------------------
-- biodata: one row per patient. Two JSON layers + static IHN code.
-- ---------------------------------------------------------------------------
CREATE TABLE biodata (
  user_id        UUID PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  profile_layer  JSONB NOT NULL DEFAULT '{}'::jsonb,
  biodata_layer  JSONB NOT NULL DEFAULT '{}'::jsonb,
  ihn_code       TEXT NOT NULL UNIQUE,   -- static, never rotates
  last_modified_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_biodata_ihn ON biodata (ihn_code);

-- ---------------------------------------------------------------------------
-- first_aid_entries: developer-managed catalog.
-- ---------------------------------------------------------------------------
CREATE TABLE first_aid_entries (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category              TEXT NOT NULL CHECK (category IN ('procedure', 'technique')),
  title                 TEXT NOT NULL,
  definition            TEXT,
  description           TEXT,
  process               TEXT,
  dos                   TEXT,
  donts                 TEXT,
  things_to_look_out_for TEXT,
  implications          TEXT,
  indication            TEXT,
  contraindications     TEXT,
  images                JSONB NOT NULL DEFAULT '[]'::jsonb,   -- array of URLs
  created_by_dev_id     UUID REFERENCES users (id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_first_aid_category ON first_aid_entries (category);

-- ---------------------------------------------------------------------------
-- suggestions: community feedback for hospitals / general product feedback.
-- ---------------------------------------------------------------------------
CREATE TABLE suggestions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id       UUID REFERENCES hospitals (id) ON DELETE CASCADE,   -- NULL = general
  submitted_by_email TEXT,
  content           TEXT NOT NULL,
  category          TEXT NOT NULL DEFAULT 'other'
                      CHECK (category IN ('data_correction', 'photo', 'hours', 'personnel', 'other')),
  status            TEXT NOT NULL DEFAULT 'new'
                      CHECK (status IN ('new', 'reviewed', 'applied', 'dismissed')),
  applied_to_field  TEXT,
  reviewed_by_dev_id UUID REFERENCES users (id) ON DELETE SET NULL,
  reviewed_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_suggestions_hospital ON suggestions (hospital_id);
CREATE INDEX idx_suggestions_status ON suggestions (status);

-- ---------------------------------------------------------------------------
-- sessions: server-side session tokens (hashed) for all account types.
-- ---------------------------------------------------------------------------
CREATE TABLE sessions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash   TEXT NOT NULL UNIQUE,   -- SHA-256 of the random token; raw token only in cookie
  account_type TEXT NOT NULL,
  expires_at   TIMESTAMPTZ NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_sessions_token ON sessions (token_hash);
CREATE INDEX idx_sessions_user ON sessions (user_id);

-- ---------------------------------------------------------------------------
-- audit_logs: append-only record of sensitive access/actions.
-- ---------------------------------------------------------------------------
CREATE TABLE audit_logs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID REFERENCES users (id) ON DELETE SET NULL,
  action_type   TEXT NOT NULL,   -- biodata_read | biodata_write | hospital_update | first_aid_upload | dev_action | ...
  resource_type TEXT,
  resource_id   TEXT,
  details       JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip_address    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_user ON audit_logs (user_id);
CREATE INDEX idx_audit_action ON audit_logs (action_type);
CREATE INDEX idx_audit_created ON audit_logs (created_at);

-- ---------------------------------------------------------------------------
-- login_attempts: rate-limiting for auth + biodata access.
-- ---------------------------------------------------------------------------
CREATE TABLE rate_limit_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_key  TEXT NOT NULL,   -- e.g. "login:email@x.com" or "biodata:userId"
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_rate_limit_bucket ON rate_limit_events (bucket_key, created_at);

COMMIT;
