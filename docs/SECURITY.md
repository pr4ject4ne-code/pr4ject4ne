# Security posture — Racoon Eye v1

This document is the standing record of the security controls in place, the audit
verdict from Phase 6, and the known remaining items. It reflects the code as
shipped (Next.js 15.5.20 App Router + PostgreSQL). The Phase 6 security audit is
owned by the security-auditor agent; this file is the builder-maintained summary.

## Authentication

- **Password hashing:** bcrypt with cost factor 12 (`src/lib/auth.ts`,
  `hashPassword`/`verifyPassword`). Password strength is validated on signup
  (`validatePasswordStrength`).
- **Session tokens:** cryptographically random 256-bit tokens
  (`generateSessionToken`). Only the SHA-256 **hash** of the token is stored in the
  `sessions` table, so a database leak never exposes live session tokens
  (`hashToken`, `getSession`). Sessions have a 30-minute TTL enforced in SQL
  (`WHERE expires_at > now()`).
- **Cookies:** session cookies are `HttpOnly`, `SameSite=Strict`, `Path=/`, and
  `Secure` in production (`sessionCookieOptions`). `Secure` is gated on
  `NODE_ENV === 'production'` so local http development still works.
- **Three isolated session types**, each in its own cookie and each requiring the
  matching `account_type`:
  - `racoon_session` — patients (`getPatientSession`, rejects any non-`patient`
    token replayed on the patient cookie).
  - `racoon_hospital_session` — hospital staff (`getHospitalStaff`).
  - `racoon_dev_session` — developers (`getDevSession`/`getDevUser`).
- **Login portals are segregated:** `/api/auth/login`, `/api/hospital/login`, and
  `/api/dev/login` each reject accounts whose `account_type` does not match the
  portal, *before* the password check. A patient credential cannot authenticate at
  the dev or hospital portal, and vice versa.
- **No user enumeration:** every login failure (unknown email, wrong password,
  inactive account, misconfigured staff) returns the same generic
  `Invalid email or password.` / 401 and emits a `login_failed` audit event.

## Authorization

- **Biodata double gate** (`src/app/api/biodata/[userId]/route.ts`): every read/write
  requires *both* (1) a valid patient session whose `user_id` equals the path
  `userId` (row-level isolation — you can only touch your own record), *and* (2) the
  correct **IHN code** in the `X-IHN-Code` header, compared in constant time
  (`constantTimeEquals`). The IHN code is the static, shareable emergency-access
  second factor. BMI is always server-derived; a client-sent `bmi` is ignored.
- **Hospital isolation choke point** (`requireHospitalOwnership` in
  `src/lib/hospital-auth.ts`): the single guard that compares the staff member's
  `hospital_id` to the path `id`. Staff of hospital A can never read or write
  hospital B's info, hours, media, announcements, or personnel — each returns 403.
- **Developer/admin gating** (`src/lib/dev-auth.ts`): dev endpoints require an
  active `developer` account; destructive/first-aid-edit actions require either
  ownership of the entry or `isAdmin` (access_level `admin`).

## Input handling

- **Parameterized queries only** — `src/lib/db.ts` exposes
  `query`/`queryOne`/`withTransaction`; all values bind through pg's `$1, $2`
  placeholders. An ESLint rule blocks tagged-template SQL.
- **Text sanitization** (`sanitizeText`) escapes HTML-significant characters on
  every stored free-text field (defense in depth on top of React's render escaping).
- **URL scheme validation** (`safeHttpUrl`) — the actual stored-XSS guard. Only
  `http:`/`https:` URLs are accepted for any value that flows into an `href`/`src`
  sink (hospital media/logo, first-aid images); `javascript:`, `data:`, `vbscript:`
  and non-strings are rejected on write and again at render.
- **LIKE-pattern escaping** (`escapeLikePattern`) escapes `\ % _` on the public,
  unauthenticated search endpoints so a term of many wildcards cannot force a
  pathological scan (cheap DoS). Paired with `ESCAPE '\'` in the query.
- **Rate limiting** (`checkRateLimit`, DB-backed sliding window): patient login
  10/5min, dev + hospital login 5/5min, biodata access 10/min, plus the public
  hospital-registration endpoint.

## Transport & headers

Set in `next.config.mjs` for every route (CSP excepted — see below):

- `Content-Security-Policy` — set per-request in `src/middleware.ts` (NOT in
  next.config: a static `script-src 'self'` blocked Next's inline hydration
  scripts). `default-src 'self'`; `script-src 'nonce-<fresh per request>'
  'strict-dynamic'` (+ `'unsafe-eval'` in dev only — Next dev tooling needs it,
  never shipped in production); styles allow `'unsafe-inline'` (required by
  Leaflet + CSS modules); `img-src`/`connect-src` allow only the OSM tile hosts
  and the OSRM routing host; `object-src 'none'`, `frame-ancestors 'none'`,
  `base-uri 'self'`, `form-action 'self'`. Guarded by
  `src/__tests__/middleware.test.ts`.
- `Strict-Transport-Security` — 2 years, `includeSubDomains; preload`, **production
  only** (would break local http dev).
- `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
  `Referrer-Policy: strict-origin-when-cross-origin`, a restrictive
  `Permissions-Policy`, and `poweredByHeader: false`.

## Audit logging

`src/lib/audit.ts` writes an append-only `audit_logs` row for every sensitive
action (biodata read/write, hospital/announcement/personnel changes, first-aid
upload/edit/delete, dev account changes, and login/login_failed/logout). Never logs
raw passwords, session tokens, or full biodata values — only field names and
identifiers. `logAudit` **swallows** DB failures (logs to stderr, never throws) so
audit failure can't break the primary request. Client IP is best-effort from
`x-forwarded-for` / `x-real-ip`.

## Phase 6 audit verdict

Core architecture is sound: parameterized queries throughout, correct
authZ/IDOR gating, bcrypt-12, hashed session tokens, pervasive audit logging,
clean secrets and git history. Findings raised and fixed:

- **H1 stored-XSS** — `sanitizeText` only escaped `<>` and didn't validate URL
  schemes, so `javascript:` URLs could reach `href`/`src`. Fixed by adding
  `safeHttpUrl()` and applying it on every write path and render guard.
- **H2 Next.js advisories** — upgraded 14.2.35 → 15.5.20 (no fix existed in the
  14.x line). Required the Next 15 async migration (`params` and `cookies()` are
  now Promises, awaited across all dynamic handlers/pages/guards).
- **M1** CSP + production HSTS added. **M2** rate-limit + sanitize on public
  hospital registration. **M3/CR6** constant-time IHN comparison. **CR1** LIKE
  escaping on search. **CR3** clamp `min_rating`. **CR4** no-op announcement PATCH
  now 400s. **L1** dropped unused `SESSION_SECRET`.

## Known remaining items

- **Dependency advisories:** 2 **moderate** transitive `postcss` advisories remain
  (build-time CSS processing of our own trusted stylesheets — not reachable at
  runtime). A definitive fix lands with Next 16; revisit when that migration is
  scheduled. CI gates on `--audit-level=critical`, so these do not block builds and
  any new critical advisory still fails CI.
- **Deferred code-reviewer items** (tracked, low priority):
  - **CR2** — unauthenticated list endpoints run an unthrottled `COUNT(*)` and lack
    a composite index; add pagination throttling + index before high traffic.
  - **CR5** — a few serial `await` queries could be parallelized with `Promise.all`.
  - **L2** — session sliding expiry (currently a fixed 30-min TTL, no refresh).
  - **L3** — `rate_limit_events` rows are never pruned; add a periodic cleanup.
  - **L4** — `x-forwarded-for` is trusted as-is; behind a proxy, trust only the
    proxy-injected hop.
- **NDPC/NDPA compliance** is a separate legal workstream (see `docs/COMPLIANCE.md`),
  deferred to post-launch and not a code control.
