# Changelog

All notable changes to Racoon Eye are recorded here. This project adheres to
[Semantic Versioning](https://semver.org/).

## [1.0.0] — 2026-07-07

First release of Racoon Eye v1 — a responsive web app for hospital discovery and
patient health data, built on Next.js 15 (App Router) + TypeScript + PostgreSQL as
a modular monolith.

### Modules shipped

- **Hospital directory, search & map** — public hospital listings (seeded Enugu
  drafts + hospital self-registration), a Leaflet/OpenStreetMap interactive map
  with OSRM routing/ETA, three search modes (nearest, by name, by symptom), an
  advanced filter page across health service types, and full hospital profile pages
  (media, info, hours, colour-coded announcement calendar, doctor roster).
- **Patient Biodata Farm** — email/password accounts with a two-layer profile:
  a freely-available Profile layer and a sensitive Biodata layer locked behind a
  static, shareable `IHN-` emergency access code. Server-derived BMI. Dashboard
  with a "Recent" view and an on-page calendar.
- **First Aid catalog + developer portal** — public read-only catalog of first-aid
  procedures and techniques, managed through a developer-only section (disconnected
  from the main site) with per-entry ownership and admin override. In-app
  educational-use disclaimer on every first-aid page.
- **Hospital management portal** — separate staff login with strict per-institution
  data isolation; staff self-edit their listing's media, info, hours, announcements,
  and personnel. Every edit is audit-logged.

### Security

- bcrypt-12 password hashing, DB-backed session tokens stored only as SHA-256
  hashes, `HttpOnly`/`SameSite=Strict`/`Secure`(prod) cookies, three isolated
  session types with cross-portal login rejection.
- Biodata owner + IHN double gate; `requireHospitalOwnership` isolation choke
  point; developer/admin gating.
- Parameterized queries throughout, text sanitization, `safeHttpUrl` scheme
  validation (stored-XSS guard), LIKE-pattern escaping, DB-backed rate limiting.
- CSP + production HSTS and a full security-header set; pervasive append-only audit
  logging. See `docs/SECURITY.md`.

### Known limitations

- **Image storage deferred** — images are stored on the local filesystem
  (`UPLOAD_DIR`); object storage (S3) and upload validation are a TODO before
  multi-instance production.
- **Symptom search is stubbed** — the homepage symptom mode is a placeholder;
  joining it with First Aid triage is post-v1.
- **NDPC/NDPA compliance pending** — the Nigerian data-protection workstream is
  legal, tracked separately in `docs/COMPLIANCE.md`, and deferred to post-launch.
- Clinical biodata fields are **unverified** until a doctor-verification feature
  exists (later phase).
- Map/routing runs on the **public OSRM/OSM demo servers** (no SLA); self-host for
  production traffic.
