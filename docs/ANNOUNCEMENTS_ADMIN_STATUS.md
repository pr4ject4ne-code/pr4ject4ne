# Announcements admin work — progress snapshot

Branch: chore/surface-fixes

This file documents the current progress after the user's confirmation to proceed.

Completed so far:
- Added announcements headline UI to src/components/Header.tsx with per-user dismiss (localStorage) and audit POST.
- Added migration: migrations/026_announcements_audit.sql to create announcements_audit table.
- Implemented audit helpers in src/lib/announcements.ts (insert/search) and enforced deletion rule C (no delete within 72h after creation AND no delete within 72h before start_at).
- Added API endpoint: src/app/api/announcements/logs/route.ts (GET search, POST insert for client audits).
- Added admin audit viewer and announcements management page: src/app/admin/announcements/page.tsx.
- Added AnnouncementForm component (admin editor) at src/components/AnnouncementForm.tsx.

Next steps to complete (planned):
1. Run type-check, lint, and unit tests locally (requires dev environment).
2. Add unit tests for deletion guards and audit endpoints.
3. Harden input validation and admin auth checks on server endpoints (reuse user.isAdmin).
4. Prepare final PR with one commit per focused item and CI job to run migrations and integration tests.

Notes:
- Audit rows are persisted permanently per user request; admin UI defaults to showing 1 year and supports "All time" queries.
- DB migrations must be applied in your environment/CI (DATABASE_URL required).
- I will not run migrations or integration tests without credentials provided to CI or your environment.

If you'd like, I can now:
- Add unit test skeletons in src/tests for announcements logic and logs API.
- Open a PR (requires permissions/automation not available in this environment).

