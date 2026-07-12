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
  10/5min, dev + hospital login 5/5min, signup 15/hour/IP, biodata access 10/min,
  first-aid upload 10/hour/dev, plus the public hospital-registration and feedback
  endpoints. The count+insert run inside a transaction guarded by a per-bucket
  `pg_advisory_xact_lock`, so a concurrent burst can't all pass the gate on the
  same pre-increment count (check-then-act race). Cleanup is two-tiered: a
  per-bucket prune plus a probabilistic global sweep of rows older than a day, so
  one-shot buckets (e.g. `login:<unique-email>`) can't accumulate forever.

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
audit failure can't break the primary request. Client IP is honored **only** when
`TRUST_PROXY_HEADERS=true` (from `x-forwarded-for` / `x-real-ip`); otherwise the IP
is stored `NULL` rather than trusting a client-spoofable header — set the flag only
behind a proxy/LB that overwrites those headers.

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

## Second remediation pass (2026-07-12)

A repeat deep review (security-auditor + code-reviewer over every route and lib)
confirmed all Phase 6 fixes are still correct and found no Critical/High. The
following were raised and **fixed** in this pass:

- **Rate-limit check-then-act race** — `checkRateLimit` was a separate SELECT then
  INSERT, so a concurrent burst could all pass the login limit on the same count.
  Now serialized per bucket with `pg_advisory_xact_lock` inside a transaction.
- **Signup unthrottled** — `/api/auth/signup` reached bcrypt (a ~250ms CPU cost)
  with no limit; added a per-IP `signup` bucket before the existence check/hash.
- **Login timing enumeration** — bcrypt ran only when a matching account existed,
  so response time revealed which emails were registered. All three login routes
  now run a dummy bcrypt (`DUMMY_PASSWORD_HASH`) on the miss path to equalize time.
- **`rate_limit_events` unbounded for one-shot buckets** — added a probabilistic
  global sweep (rows older than a day) alongside the existing per-bucket prune.
- **Patient session didn't re-check `is_active`** — `getPatientSession` now reloads
  the user and rejects deactivated/deleted patients, matching the dev/hospital
  guards.
- **Biodata layers stored unvalidated/unbounded** — new `sanitizeLayer` rejects
  non-object layers (a string/array would spread into corrupt keys), escapes string
  leaves, and caps key count/value length. Applied to both biodata PATCH routes.
- **Public suggestion/feedback input** — `submitted_by_email` is now validated with
  `isValidEmail` (blocks CRLF header-injection into the out-of-band email worker)
  and free text is `sanitizeText`-escaped.
- **Correctness:** per-hospital suggestions list now paginated; `parseOffset`
  clamped (deep-pagination DoS); hospital logo can be cleared (null vs absent);
  `event_date` validated (bad date was a 500); dev-account and dev-suggestion PATCH
  now 404 on zero rows instead of a misleading `success: true`.
- **Perf:** migration `003_search_trgm_indexes.sql` adds `pg_trgm` GIN indexes so
  the public leading-wildcard ILIKE searches are index-backed instead of seq scans.

Previously-deferred items now **done** and verified present in code: CR2 (COUNT cap
+ composite index, `002`), CR5 (`Promise.all` on the directory count/page), L2
(sliding expiry with 12h absolute cap), L3 (`rate_limit_events` pruning).

## Known remaining items (need a decision or infra)

- **Per-IP rate-limit source (from M2/L4):** public buckets key on the client IP,
  but `clientIpFrom` returns `NULL` unless `TRUST_PROXY_HEADERS=true`, so by default
  they collapse to one global `unknown` bucket (one actor can exhaust a public
  endpoint for everyone) — and even when trusted, `x-forwarded-for` is read
  leftmost. **Action for deploy:** derive the client IP from the hosting platform's
  verified source (e.g. Vercel `request.ip`) rather than a boolean toggle.
- **Login-attempt keying:** the login limiter keys on email only, so a knowing
  attacker can burn a victim's budget (lockout DoS), and successful logins count
  toward the limit. A robust fix needs the per-IP dimension above.
- **IHN "emergency sharing" is not actually reachable:** `/api/biodata/[userId]`
  requires `session.user_id === paramUserId`, so no relative can present someone
  else's IHN to read their biodata — the IHN currently only second-gates the
  owner's own data (which `/api/biodata/me` already returns without it). Either
  build a real cross-user shared-access endpoint (with its own strict rate-limit +
  audit) or drop the "shareable" framing from the UI/Terms. **Founder decision.**
- **Dependency advisories:** 2 **moderate** transitive `postcss` advisories remain
  (build-time only, not reachable at runtime). Clears with Next 16. CI gates on
  `--audit-level=critical`, so these don't block builds.
- **First-aid PATCH/DELETE** has no rate limit (dev-authed, low priority); public
  suggestion submissions and 429 hits aren't audit-logged (would aid brute-force
  detection).
- **NDPC/NDPA compliance** is a separate legal workstream (see `docs/COMPLIANCE.md`),
  deferred to post-launch and not a code control.
