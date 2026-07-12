# Developer & admin portal

Covers `/dev/login`, `/dev/dashboard`, and the admin hub `/dev/primary`. Read
[README.md](README.md) first for the shared auth model, access levels, bootstrap,
and audit conventions.

Design specs: [`docs/pages/primary-dev-page.md`](../pages/primary-dev-page.md).

## Pages

| URL | Purpose | Access |
| --- | --- | --- |
| `/dev/login` | Developer login form | Any developer |
| `/dev/dashboard` | Landing hub after login; links to First Aid, and (admins only) the Admin hub | Any developer |
| `/dev/primary` | Admin hub: developer accounts, audit log, suggestions | `admin` only |

The portal renders inside `DevShell` (`src/app/dev/DevShell.tsx`) — a self-contained
chrome with **no links back into the public site**. The dashboard only surfaces the
"Admin" card when the signed-in developer is an admin (`dev.is_admin`), but the real
gate is server-side: `/dev/primary`'s data endpoints all re-check `isAdmin`.

## Login — `POST /api/dev/login`

Body: `{ email, password }`. Rate-limited `dev_login:<email>` → 5 / 5 min. Rejects
any account whose `account_type` is not `developer` before checking the password,
and rejects inactive accounts. On success sets `racoon_dev_session`, updates
`last_login`, and emits a `login` audit event. Failures emit `login_failed` and
return a generic 401.

Session check: `GET /api/dev/session` → `{ authenticated, email, access_level }`.
Logout: `POST /api/dev/logout` (deletes the session row and clears the cookie).

## Admin hub — `/dev/primary`

All three sections below are **admin-only** (`403 FORBIDDEN` for a
`first_aid_editor`), except suggestions which any developer may review.

### 1. Developer account management — `/api/dev/accounts`

| Method | Action | Notes |
| --- | --- | --- |
| `GET` | List developer accounts | Returns id, email, access_level, is_active, last_login, created_at. No password hashes. |
| `POST` | Create a developer | Body `{ email, access_level }`. `access_level` is `admin` or (default) `first_aid_editor`. Generates a strong temp password and returns it **once** in `temp_password` — it is never stored in plaintext and cannot be retrieved again. Duplicate email → `409 EMAIL_EXISTS`. |
| `PATCH` | `revoke` / `reactivate` / `reset_password` | Body `{ id, action }`. `revoke` sets `is_active=false` **and deletes all of that user's sessions** (immediate logout). `reset_password` issues a new temp password (returned once) and also kills sessions. You cannot revoke your own account. |

Every account change writes a `dev_account_change` audit row with the operation and
target. Temp passwords are `randomBytes(12).toString('base64url')` — share them over
a secure channel; the recipient should change theirs after first login (there is no
forced-rotation flow in v1 — track this if it matters).

### 2. Audit log — `GET /api/dev/audit-logs`

Searchable, paginated (`limit` default 50, max 200; `offset`). Optional filters:
`action` (matches `action_type`) and `resource_type`. Ordered newest-first. Returns
`{ logs, total, limit, offset }`. Admin-only. No count cap here (unlike public
endpoints) because it isn't a public DoS surface. See the action-type list in
[README.md](README.md#audit-logging).

### 3. Suggestions — `/api/dev/suggestions`

Community corrections to hospital listings land here (submitted from public hospital
profiles). **Any developer** (not just admin) may triage them.

| Method | Action |
| --- | --- |
| `GET` | List suggestions, optional `?status=new|reviewed|applied|dismissed`, paginated. Joins the hospital name. |
| `PATCH` | Body `{ id, status }`. Sets the status, stamps `reviewed_by_dev_id` and `reviewed_at`, emits `suggestion_review`. |

The workflow is deliberately informational: a developer reads a suggestion, manually
applies the correction to the community-managed listing if warranted, and marks it
`applied`/`dismissed`. There is no automated write-through from a suggestion to a
hospital record.

## Access-level cheatsheet

- `admin` — accounts, audit log, suggestions, first-aid, edit/delete **any**
  first-aid entry.
- `first_aid_editor` — first-aid (own entries), suggestions. `403` on accounts and
  audit log.

## Security notes

- Admin endpoints re-verify `getDevUser()` + `isAdmin()` on every request — the UI
  hiding the Admin card is cosmetic only.
- All UUID path/body inputs are validated against a UUID regex before hitting the
  DB.
- Revoking or resetting an account force-invalidates its sessions, so a compromised
  or offboarded developer is logged out immediately.
- `security-auditor` must review this surface before any production deploy — it is
  the master key to developer access (per the design spec).

### Known gaps / not in v1

- No MFA on admin login (design spec lists it as desirable). Compensating controls:
  segregated hardened session, rate limiting, full audit trail, disconnection.
- No IP allow-listing.
- No forced temp-password rotation or credential-expiry policy.
- Access-level taxonomy is fixed to two roles (`admin`, `first_aid_editor`); the
  spec's general "access type management" is not built.
