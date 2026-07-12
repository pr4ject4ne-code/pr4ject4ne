# Developer & admin portal

Covers `/dev/login`, `/dev/dashboard`, and the admin hub `/dev/primary`. Read
[README.md](README.md) first for the shared auth model, access levels, bootstrap,
and audit conventions.

Design specs: [`docs/pages/primary-dev-page.md`](../pages/primary-dev-page.md).

## Pages

| URL | Purpose | Access |
| --- | --- | --- |
| `/login` | **Unified login** — the single entry for all account types | Everyone |
| `/dev/dashboard` | Landing hub after login; links to First Aid, and (primary only) the Admin hub | Any developer |
| `/dev/primary` | Admin hub: developer accounts, audit log, suggestions | `primary` only |

The portal renders inside `DevShell` (`src/app/dev/DevShell.tsx`) — a self-contained
chrome with **no links back into the public site**. The dashboard only surfaces the
"Admin" card when the signed-in developer is primary (`dev.is_primary`), but the real
gate is server-side: `/dev/primary`'s data endpoints all re-check `isPrimary`.
`/dev/login` still exists but just redirects to `/login`.

## Login (unified) — `POST /api/auth/login`

Everyone — patient, developer, tertiary — signs in at `/login`. Body
`{ email, password }`, rate-limited `login:<email>` → 10 / 5 min. On success the
response includes `account_type`, `access_level`, and a `redirect`; the developer
case sets `racoon_dev_session` and lands on `/dev/dashboard`. bcrypt runs on the
miss path too (timing equalization). Failures emit `login_failed` and return a
generic 401. *Only a developer credential opens dev pages* — the pages check the
dev session, so the shared entry form doesn't weaken that.

Session check: `GET /api/dev/session` → `{ authenticated, email, access_level,
is_primary, is_secondary }`. Logout: `POST /api/dev/logout`.

## Admin hub — `/dev/primary`

Developer-account management is **primary-only** (`403 FORBIDDEN` for a secondary).
Suggestions and the audit log are available to any developer (secondaries monitor
the system).

### 1. Developer account management — `/api/dev/accounts` (primary only)

| Method | Action | Notes |
| --- | --- | --- |
| `GET` | List developer accounts | Returns id, email, access_level, is_active, last_login, created_at. No password hashes. |
| `POST` | Create a **secondary** developer | Body `{ email }`. Always mints `access_level='secondary'` — a second primary is never created through the app. Returns a strong temp password **once** in `temp_password`. Duplicate email → `409 EMAIL_EXISTS`. |
| `PATCH` | `revoke` / `reactivate` / `reset_password` | Body `{ id, action }`. `revoke` sets `is_active=false` **and deletes all that user's sessions**. `reset_password` issues a new temp password (once) and kills sessions. You cannot revoke your own account. 404 on an unknown id. |

### 1b. Tertiary provisioning — `/api/dev/tertiary` (any developer)

Secondaries (and primary) create/oversee level-3 **hospital_staff** accounts.

| Method | Action | Notes |
| --- | --- | --- |
| `GET` | List tertiary accounts | Optional `?hospital_id=`; paginated. |
| `POST` | Create a tertiary | Body `{ email, hospital_id }`. The hospital must exist (404 otherwise). Creates a `hospital_staff` user linked to that `hospital_id`, `verified=true`, and returns a one-time temp password. Duplicate email → 409. |
| `PATCH` | `revoke` / `reactivate` / `reset_password` | Body `{ id, action }`. Same semantics as dev accounts; scoped to `hospital_staff`. |

Every change writes a `dev_account_change` (developers) or `tertiary_account_change`
(institution staff) audit row. Temp passwords are one-time; the new holder sets
their own via `PATCH /api/account/password` (email is not editable).

### 2. Audit log — `GET /api/dev/audit-logs` (any developer)

Searchable, paginated (`limit` default 50, max 200; `offset`). Optional filters:
`action` (matches `action_type`) and `resource_type`. Ordered newest-first. Returns
`{ logs, total, limit, offset }`. No count cap here (not a public DoS surface). See
the action-type list in [README.md](README.md#audit-logging).

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

- `primary` — developer accounts (create secondary, revoke/reset), tertiary
  provisioning, audit log, suggestions, and full First Aid management.
- `secondary` — tertiary provisioning, audit log (monitor), suggestions, and full
  First Aid management (both levels can edit/delete **any** entry). `403` on
  developer-account management (`/api/dev/accounts`).

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
- Access-level taxonomy is fixed to `primary` / `secondary` (+ tertiary via
  `hospital_staff`); finer-grained per-feature "access types" are not built.
- The single-primary invariant is a convention (the app never mints a second
  primary), not a DB constraint — a second primary can only exist via the bootstrap
  script or a manual DB change.
