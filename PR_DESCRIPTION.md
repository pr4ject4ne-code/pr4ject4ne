Title: Add announcements audit logging, per-user dismissals, admin audit viewer, and deletion protections

Summary
- Adds an announcements_audit table and audit plumbing to record admin actions and per-user dismissal events.
- Headline announcements can be dismissed per-user (persisted client-side) and dismissals are recorded server-side via /api/announcements/logs.
- Admin UI at /admin/announcements to manage announcements and search audit logs (default: last 365 days; “All time” option available). CSV export included.
- Deletion protections enforced: no deletion within 72 hours after an announcement is created, and no deletion within 72 hours before an announcement’s start_at. Blocked delete attempts are logged with a reason.

Files changed / highlights
- migrations/026_announcements_audit.sql
- src/lib/announcements.ts
- src/app/api/announcements/logs/route.ts
- src/components/Header.tsx
- src/components/AnnouncementForm.tsx
- src/app/admin/announcements/page.tsx
- src/lib/__tests__/announcements.test.ts
- docs/ANNOUNCEMENTS_ADMIN_STATUS.md
- .github/workflows/announcements-ci.yml (CI: type-check, lint, tests, build, integration with Postgres)

DB migration required
Run migrations/026_announcements_audit.sql before using the audit endpoints. Example:

  psql "$DATABASE_URL" -f migrations/026_announcements_audit.sql

Testing & verification
CI should run type-check, lint, unit tests, build, and integration tests (the workflow added runs those).

Rollback
To remove audit storage (destroys audit history):

  DROP TABLE IF EXISTS announcements_audit CASCADE;

Notes
- Admin UI is gated by user.isAdmin. If you use a different flag/role, tell me and I’ll update it.
- Audit rows are retained permanently by design; the admin UI defaults to one year but supports “All time”.

Local verification commands
- Checkout branch:
  git fetch origin
  git checkout -b chore/surface-fixes origin/chore/surface-fixes

- Apply migration:
  psql "$DATABASE_URL" -f migrations/026_announcements_audit.sql

- Install & checks:
  npm ci
  npm run type-check
  npm run lint
  npm test
  npm run build

- Sanity curl commands after running the app locally:
  curl http://localhost:3000/api/announcements/headlines
  curl -X POST http://localhost:3000/api/announcements/logs -H "Content-Type: application/json" -d '{"announcement_id":"<id>","action":"dismissed"}'
  curl 'http://localhost:3000/api/announcements/logs?q=keyword&page=1&pageSize=50'

CI / PR notes
- To open the PR using gh CLI:
  gh pr create --base main --head pr4ject4ne-code:chore/surface-fixes --title "Add announcements audit logging, per-user dismissals, admin audit viewer, and deletion protections" --body-file PR_DESCRIPTION.md

Or open in the web UI:
  https://github.com/pr4ject4ne-code/pr4ject4ne/compare/main...chore/surface-fixes?expand=1

If you want, I can also open the PR for you if you provide a GitHub token and allow me to call the API (not available in this environment).