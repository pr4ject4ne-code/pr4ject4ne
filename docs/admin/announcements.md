# Announcements — Admin & migration notes

This document describes the operational steps to enable and verify the announcements admin + audit feature added on the chore/surface-fixes branch.

Why this exists
- The admin feature records announcement lifecycle events (create/update/delete/dismiss) to an append-only audit table `announcements_audit` so operators can review changes and user dismissals.

Required DB migration
- Apply the SQL migration included in the branch:

  migrations/026_announcements_audit.sql

- Example (run in staging first, then production):

  export DATABASE_URL="postgres://username:password@host:5432/dbname"
  psql "$DATABASE_URL" -f migrations/026_announcements_audit.sql

Admin UI
- URL (after deploy): `/admin/announcements`
- Access control: the page requires a developer account. The code checks `user.isAdmin` (alias for primary developer in this project). If your auth model uses a different property, update the gating logic in `src/app/admin/announcements/page.tsx`.

Quick verification (after deploy + migration)
1. Visit /admin/announcements while signed-in as an admin and confirm you can:
   - See the list of announcements
   - Create a new announcement
   - Edit an existing announcement
   - Delete (subject to deletion protections)
   - Search audit logs and export CSV
2. In a non-admin browser, visit the app and confirm the announcement headline appears and can be dismissed (client will POST a dismissal event to /api/announcements/logs).
3. Query logs directly:
   curl 'https://<your-app>/api/announcements/logs?page=1&pageSize=10'

Deletion protections
- Deletions are blocked if they violate either rule:
  - Within 72 hours after creation (no immediate permanent deletes)
  - Within 72 hours before the scheduled start_at
- Blocked deletes return a 4xx error and are recorded in the audit table with a `details` field explaining the reason.

CI and tests
- The branch includes a GitHub Actions workflow `.github/workflows/announcements-ci.yml` that runs type-check, lint, unit tests, and an integration job using a Postgres service.
- The branch also includes unit tests for deletion guards in `src/lib/__tests__/announcements.test.ts`.

Rollback
- To remove the audit table (destructive):
  psql "$DATABASE_URL" -c "DROP TABLE IF EXISTS announcements_audit CASCADE;"

Questions / follow-ups
- If you want the admin gate to use a different property (for example `user.access_level`), tell me and I can update the code on the branch.
- If you want an automated archival job for old audit rows, I can add a scheduled action that exports older rows to CSV and removes them from the main table.
