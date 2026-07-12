# Admin & developer operations — Racoon Eye v1

Operational documentation for the **non-public** admin and developer surfaces. This
is the "how it actually works and how to run it" companion to the design specs in
[`docs/pages/`](../pages/) (which describe intended UX). Where a design spec left
something "TBD", this folder records what the shipped code actually does.

| Surface | Docs | Pages | Who |
| --- | --- | --- | --- |
| Developer / admin portal | [developer-portal.md](developer-portal.md) | `/dev/login`, `/dev/primary`, `/dev/dashboard` | Platform developers & admins |
| First-aid catalog admin | [first-aid-catalog.md](first-aid-catalog.md) | `/dev/first-aid` | Developers (any access level) |
| Hospital management portal | [hospital-portal.md](hospital-portal.md) | `/hospital/login`, `/hospital/dashboard` | Verified hospital staff |

## The disconnection rule

None of these pages are linked from the public site — no header, hamburger menu,
footer, or homepage link points at `/dev/*` or `/hospital/*`. They are reachable
only by typing the URL directly. Every admin/dev page also sets
`robots: { index: false, follow: false }` so it is never indexed. **Do not add a
link to any of these from a public component.** Access control is still enforced
server-side regardless (see below) — the disconnection is defence-in-depth, not the
lock itself.

## Shared authentication model

All three account kinds live in one `users` table keyed by `account_type`
(`patient` | `hospital_staff` | `developer`). What separates the portals:

- **Three isolated session cookies**, each bound to a matching `account_type`. A
  token minted for one portal is rejected by the others:
  - `racoon_session` — patients
  - `racoon_hospital_session` — hospital staff
  - `racoon_dev_session` — developers
- Cookies are `HttpOnly`, `SameSite=Strict`, `Path=/`, and `Secure` in production.
- Login portals are **segregated before the password check**: `/api/dev/login` and
  `/api/hospital/login` reject any account whose `account_type` doesn't match, so a
  patient credential can never authenticate at a privileged portal, and vice versa.
- Session tokens are 256-bit random; only their SHA-256 hash is stored. Sessions
  have a 30-minute sliding TTL, hard-capped at 12 hours absolute
  (`src/lib/auth.ts`).
- No user enumeration: every login failure returns the same generic
  `Invalid email or password.` (401) and emits a `login_failed` audit event.

See [`docs/SECURITY.md`](../SECURITY.md) for the full posture.

## Developer access levels

Developers carry an `access_level`:

| `access_level` | Can do |
| --- | --- |
| `admin` | Everything below **plus** the primary-dev hub: create/revoke/reset developer accounts, view the full audit log. |
| `first_aid_editor` | Log in, manage the first-aid catalog, review suggestions. Cannot manage developer accounts or read the audit log. |

`isAdmin(user)` (`src/lib/dev-auth.ts`) is the single check; admin-only endpoints
return `403 FORBIDDEN` for a non-admin developer.

## Bootstrapping the first admin

Every `/api/dev/accounts` operation requires an *existing* admin, so a fresh
database has no way in. Break the cycle once with the bootstrap script — it reads
credentials from the environment (never hardcoded, never echoed):

```sh
# PowerShell
$env:BOOTSTRAP_ADMIN_EMAIL='admin@example.com'
$env:BOOTSTRAP_ADMIN_PASSWORD='<strong-password>'   # must pass the password policy
npm run db:bootstrap-admin
```

It is idempotent: no existing user → creates an admin developer; existing developer
→ promotes to admin, reactivates, and resets the password; existing
patient/hospital user with that email → refuses (won't hijack another account). The
action is written to the audit log. After first login, rotate the password from
`/dev/primary`. Source: [`scripts/bootstrap-admin.ts`](../../scripts/bootstrap-admin.ts).

There is **no** self-service developer signup — new developers only ever come from
an admin at `/dev/primary`. Hospital-staff accounts are provisioned out-of-band (the
partner-registration flow) and linked to a `hospital_id`.

## Audit logging

Every privileged action writes an append-only row to `audit_logs` via
`logAudit()` (`src/lib/audit.ts`): `user_id`, `action_type`, `resource_type`,
`resource_id`, JSON `details` (field names/ids only — never raw passwords, tokens,
or biodata values), `ip_address`, `created_at`. Audit writes never throw into the
request path — a failed write is logged to stderr and the request still succeeds.

Action types currently emitted: `login`, `login_failed`, `logout`, `biodata_read`,
`biodata_write`, `hospital_register`, `hospital_update`, `announcement_change`,
`personnel_change`, `first_aid_upload`, `first_aid_edit`, `first_aid_delete`,
`dev_account_change`, `suggestion_review`.

IP addresses are only recorded when `TRUST_PROXY_HEADERS=true` (set that only when
deployed behind a proxy/LB that overwrites `x-forwarded-for`); otherwise the IP is
stored as `NULL` rather than trusting a client-spoofable header.

## Rate limits (admin/dev surfaces)

DB-backed sliding-window limiter (`checkRateLimit`, self-pruning):

| Bucket | Limit |
| --- | --- |
| `dev_login:<email>` | 5 / 5 min |
| `hospital_login:<email>` | 5 / 5 min |
| `first_aid_upload:<devId>` | 10 / hour |
| `hospital_register:<ip>` | 5 / hour (public registration) |
