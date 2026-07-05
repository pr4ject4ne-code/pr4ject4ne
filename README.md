# Racoon Eye v1

A responsive web app (mobile-first) that lets Nigerian clinics and patients:

1. **Discover hospitals** — a searchable, filterable directory with self-registration (verified institutional accounts + community-managed listings).
2. **Manage patient biodata** — a two-layer profile secured by a static, shareable `IHN-` emergency access code.
3. **Read first-aid guidance** — a developer-managed catalog of procedures and techniques.

**Stack:** TypeScript · Next.js 14 (App Router) · PostgreSQL · Leaflet.js + OpenStreetMap + OSRM routing · modular monolith.

---

## Prerequisites

- Node.js `>=20`
- Docker (for local PostgreSQL) or a reachable PostgreSQL 16 instance

## Setup

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env.local
# Edit .env.local — set DATABASE_URL and generate a SESSION_SECRET:
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"

# 3. Start PostgreSQL (Docker)
docker compose up -d
# Postgres listens on localhost:5432 (db: racoon_eye, user: racoon)

# 4. Run migrations (applied automatically on first `docker compose up` via
#    docker-entrypoint-initdb.d; run manually against an existing DB with:)
npm run db:migrate

# 5. Start the dev server
npm run dev
# App runs at http://localhost:3000
```

## Commands

| Command | Description |
| --- | --- |
| `npm run dev` | Start the dev server with live reload |
| `npm run build` | Production build |
| `npm run start` | Serve the production build |
| `npm run lint` | ESLint (Next core-web-vitals + security rules) |
| `npm run type-check` | TypeScript type checking (`tsc --noEmit`) |
| `npm run format` / `npm run format:check` | Prettier write / check |
| `npm run test` | Jest unit + integration tests |
| `npm run test:coverage` | Tests with coverage report |
| `npm run db:migrate` | Apply SQL migrations in `migrations/` |

## Environment variables

All configuration is via environment variables. See [`.env.example`](.env.example) for the full list with descriptions. Real secrets go in `.env.local` (dev) or the platform secret store (prod) — never in git.

## Project structure

```
src/
  app/            Next.js App Router pages + API route handlers
    api/          Route handlers (auth, hospitals, biodata, first-aid, ...)
  components/     Shared UI components (Header, Footer, Button, ...)
  lib/            db, auth, audit, IHN codes, map/geolocation helpers
  styles/         Theme tokens
  types/          Shared TypeScript models
migrations/       Reversible SQL migrations
docs/pages/       Per-page product specs (source of truth for layout/fields)
```

## Testing

```bash
npm run test              # run once
npm run test:watch        # watch mode
npm run test:coverage     # with coverage
```

## Security notes

- Passwords are hashed with bcrypt (≥12 salt rounds); session tokens are cryptographically random and stored in HTTP-only cookies.
- All database access uses parameterized queries only (see `src/lib/db.ts`).
- Every biodata read/write and developer/hospital action is audit-logged.
- The `IHN-` code is a static, shareable emergency access key — it never rotates.

## Deferred (v1)

- **Image storage:** uses the local filesystem (`UPLOAD_DIR`) for dev. TODO: wire S3/server object storage when infrastructure is ready.
- **OSRM:** uses the public demo server (no key required).
- **Legal/NDPC compliance:** post-launch workstream.
- **Symptom search:** stubbed as basic text input on the homepage; full triage join with First Aid is a later phase.
