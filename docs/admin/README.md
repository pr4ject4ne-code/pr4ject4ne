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

## The three-level model

Dev/admin access has three levels:

| Level | Name | `account_type` / `access_level` | Responsibilities |
| --- | --- | --- | --- |
| **1** | **Primary** (executive) | `developer` / `primary` | Manages all levels; grants/revokes; **creates secondary** accounts; full audit/monitor. Currently a single account. |
| **2** | **Secondary** (operational) | `developer` / `secondary` | **Creates tertiary** accounts; oversees level 3; manages the First Aid catalog; monitors the system. |
| **3** | **Tertiary** (non-developer) | `hospital_staff` (+ `hospital_id`) | Manages **only its own institution's** outlook (listing, media, hours, announcements, personnel) via the hospital portal. |

**Creation cascade:** Primary creates Secondary; Secondary creates Tertiary. Each
new account gets a one-time temp password (shown once); the holder then sets their
own from the dev page. **Email is immutable; passwords are self-editable** via
`PATCH /api/account/password`.

## Shared authentication model

All account kinds live in one `users` table keyed by `account_type`
(`patient` | `hospital_staff` | `developer`).

- **Unified login entry:** everyone signs in at **`/login`** with email + password
  (`POST /api/auth/login`). The account's own type decides which session cookie is
  set and where it lands (patient → `/dashboard`, developer → `/dev/dashboard`,
  tertiary → `/hospital/dashboard`). *Only dev credentials open dev pages* — the
  pages check the session type, so a patient credential can never reach them even
  though the entry form is shared. The legacy `/api/dev/login` and
  `/api/hospital/login` endpoints still work for API clients and enforce the same
  type gate.
- **Three session cookies**, each bound to a matching `account_type`; a token minted
  for one is rejected by the other guards:
  - `racoon_session` — patients · `racoon_hospital_session` — tertiary ·
    `racoon_dev_session` — developers
- Cookies are `HttpOnly`, `SameSite=Strict`, `Path=/`, and `Secure` in production.
- Session tokens are 256-bit random; only their SHA-256 hash is stored. Sessions
  have a 30-minute sliding TTL, hard-capped at 12 hours absolute
  (`src/lib/auth.ts`). Login runs bcrypt on the miss path too, so response time
  can't enumerate registered emails.
- No user enumeration: every login failure returns the same generic
  `Invalid email or password.` (401) and emits a `login_failed` audit event.

See [`docs/SECURITY.md`](../SECURITY.md) for the full posture. `isPrimary` /
`isSecondary` (`src/lib/dev-auth.ts`) are the level checks; `isAdmin` is a
back-compat alias for `isPrimary`.

## Bootstrapping the first primary

Every account-creation path requires an *existing* higher level, so a fresh
database has no way in. Break the cycle once with the bootstrap script (reads
credentials from the environment, never hardcoded/echoed):

```sh
# PowerShell
$env:BOOTSTRAP_ADMIN_EMAIL='primary@example.com'
$env:BOOTSTRAP_ADMIN_PASSWORD='<password>'   # policy is not enforced here; rotate after login
npm run db:bootstrap-admin
```

Idempotent: no existing user → creates a **primary** developer; existing developer
→ promotes to primary, reactivates, resets the password; existing patient/hospital
user with that email → refuses (won't hijack another account). Written to the audit
log. After first login, rotate the password in-app. Source:
[`scripts/bootstrap-admin.ts`](../../scripts/bootstrap-admin.ts).

There is **no** self-service developer signup — secondaries come from the primary at
`/dev/primary`; tertiaries come from a developer via `POST /api/dev/tertiary`.

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
