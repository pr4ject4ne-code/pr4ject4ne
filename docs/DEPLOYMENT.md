# Deployment — Racoon Eye v1

A Next.js 15 (App Router) app backed by PostgreSQL. This is the checklist to take
it from a clean host to a running service.

## Prerequisites

- Node.js (matching the version CI builds against) and npm.
- A reachable PostgreSQL instance.

## Environment variables

All configuration is via environment variables; `.env.example` documents every
one. Copy it to `.env.local` (dev) or set them in the platform secret store
(production) — never commit real secrets.

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | yes | PostgreSQL connection string used by `src/lib/db.ts`. |
| `NODE_ENV` | yes (prod) | Set to `production` in production — this enables `Secure` session cookies and the HSTS header. |
| `SUGGESTIONS_EMAIL` | yes | Server-side destination for "suggestion tab" feedback. Never exposed to the client. |
| `NEXT_PUBLIC_OSRM_URL` | yes | OSRM routing/ETA host. Defaults to the public OSRM demo server. |
| `NEXT_PUBLIC_OSM_TILE_URL` | yes | OpenStreetMap tile URL template for Leaflet. |
| `UPLOAD_DIR` | yes | Local filesystem directory for uploaded images (dev). See the storage note below. |

## Steps

1. **Provision PostgreSQL** and set `DATABASE_URL`.
2. **Run migrations.** The forward-only runner applies every `NNN_*.sql` in
   `migrations/` (excluding `*.down.sql`) that has not yet been recorded in
   `schema_migrations`, in filename order:
   ```bash
   npm run db:migrate
   ```
   `.down.sql` files exist for reversibility. Take a backup before any schema
   change in production.
3. **Set `NODE_ENV=production`.** This is what turns on the `Secure` cookie flag
   (`sessionCookieOptions`) and the `Strict-Transport-Security` header
   (`next.config.mjs`). Deploying with a non-production `NODE_ENV` ships insecure
   cookies over the network — verify this.
4. **Build and start.**
   ```bash
   npm ci
   npm run build
   npm start
   ```
5. **Deploy only from green builds.** CI must pass (lint, type-check, format,
   tests, build, `npm audit --audit-level=critical`) before a release.

## Health check

`GET /api/health` returns `200 {"status":"ok","db":"ok"}` when the process is up
and the database is reachable, and `503 {"status":"degraded","db":"unreachable"}`
otherwise. Wire this to the platform's liveness/readiness probe.

## Image storage (TODO)

Image storage is currently **local filesystem** under `UPLOAD_DIR`. This does not
survive across ephemeral/containerized instances and does not scale horizontally.
Before multi-instance production, wire object storage (S3 or equivalent) and add
upload validation (file type jpeg/png/webp, size ≤5MB) — flagged as a TODO in
`src/app/api/hospital/[id]/media/route.ts`.

## External services

The map/routing stack uses the **public OSRM demo server** (`router.project-osrm.org`)
and **public OpenStreetMap tile servers**. These require no API key or account, but
they are shared demo infrastructure with no SLA and usage policies. For production
traffic, self-host OSRM and use a tile provider you control or have terms with.
