# Login / Sign-up — Racoon Eye v1

Status: **partially discussed and confirmed** (2026-07-05) — authentication method confirmed, full UI/flow TBD.

Reached via the hamburger menu's "Profile" item on the homepage ([homepage.md](homepage.md)) — opens login/sign-up if the user isn't authenticated, or routes straight to the dashboard ([dashboard.md](dashboard.md)) if they are.

## Authentication

- **Method:** Email + Password (standard credentials, no social login or 2FA in v1).
- **For patients:** Sign up with email and password; creates a patient account that can then be used to populate the biodata profile ([dashboard.md](dashboard.md)).
- **For institutions/hospitals:** Institution accounts with partner-registration flow per SPEC.md module 1 — exact separate flow TBD (may be a different login screen, or a post-signup "account type" selection; not yet decided).

## Design & layout

- Top bar and footer are the standard shared components from [homepage.md](homepage.md).
- All theme rules apply: matte blue/white/amethyst, sans-serif fonts, no gradients into white, no colored text on white.
- **Suggestion tab** (per first-aid requirements) should appear on this page too — submits to the site's support email.
- Exact form layout, wording, and input validation rules left to builder's discretion.

## Open items / not yet decided

- Institutional login flow (hospitals/partner accounts) — separate page/screen, or integrated into the same login page with an account-type selector?
- Password complexity/strength requirements (if any).
- Email verification on signup (send confirmation email, or skip for v1)?
- "Forgot password" recovery flow (if any).
- Session timeout and token expiration rules.
