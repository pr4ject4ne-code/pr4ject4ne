# Testing — Racoon Eye v1

Automated tests run under Jest. The suite covers the security-critical paths
(auth, session isolation, biodata gating, hospital data isolation, developer
gating) plus the pure library helpers.

## Running the tests

```bash
npm test               # run the full suite once
npm run test:watch     # watch mode
npm run test:coverage  # with a coverage report
npm run type-check     # tsc --noEmit (no test run, type safety only)
npm run lint           # eslint
```

Tests need no database or network — every DB and auth boundary is mocked (see
below). CI runs `lint`, `type-check`, `format:check`, the full test suite, a
production build, and `npm audit --audit-level=critical` on every push.

## Mocking conventions

Route handlers are called directly (not over HTTP), so tests must reproduce the
Next.js 15 runtime shape and stub the module boundaries Jest can intercept.

- **Async route params.** Dynamic handlers receive
  `{ params }: { params: Promise<{ id: string }> }`. Pass params as
  `Promise.resolve({ id })` — e.g.
  `await GET(req, { params: Promise.resolve({ userId: OWN_ID }) })`.
- **cookies().** `next/headers` `cookies()` returns a Promise; the code does
  `await cookies()`. Mock it to return a plain object (`await` on a plain object
  yields the object): `jest.mock('next/headers', () => ({ cookies: () => ({ get: ... }) }))`.
- **Mock the `@/lib/auth` boundary, not intra-module calls.** Guards such as
  `requireHospitalOwnership` and `getDevUser` call `getSession` + `findUserById`
  from `@/lib/auth` across a **module boundary** — which Jest can intercept — but
  call helpers like `getHospitalStaff` *within* the same module, which a partial
  mock cannot intercept. So we stub `getSession`/`findUserById` (spreading
  `jest.requireActual('@/lib/auth')` for the rest) and let the *real* guard run.
  This is a stronger test than stubbing the guard itself. See
  `src/app/api/__tests__/hospital-isolation.test.ts` for the canonical pattern.
- **DB mock.** `jest.mock('@/lib/db', () => ({ query, queryOne }))` with jest.fn()s;
  drive `mockResolvedValue({ rows: [...] })` / row objects per test.
- **Audit mock.** `jest.mock('@/lib/audit', () => ({ logAudit: jest.fn()..., clientIpFrom: () => ... }))`.

## What's covered

- **`src/lib/auth.ts`** — password hashing (bcrypt ≥12), email/password-strength
  validators, session token generate/hash, constant-time compare, `getSession`
  (null on absent/expired), `getPatientSession` (rejects non-patient replay),
  `checkRateLimit` (allow under / block at the limit), `toPublicUser`.
- **`src/lib/dev-auth.ts`** — dev session/user resolution rejects non-developer,
  inactive, and absent/expired sessions; `isAdmin` only for `admin`.
- **`src/lib/audit.ts`** — `logAudit` column contract and the swallow-on-failure
  guarantee; `clientIpFrom` header parsing.
- **`src/lib/sanitize.ts`** — `sanitizeText`, `safeHttpUrl` (scheme allow/deny),
  `escapeLikePattern`.
- **Login routes** (`/api/auth/login`, `/api/dev/login`, `/api/hospital/login`) —
  generic 401 with no user enumeration, cross-portal `account_type` rejection,
  inactive / null-`hospital_id` accounts, the rate-limit 429 branch, and the
  `login_failed` audit event.
- **Biodata** (`/api/biodata/[userId]`) — GET and PATCH session + IHN double gate,
  cross-user 403, server-derived BMI (client `bmi` ignored).
- **Hospital isolation** (`hospital-isolation.test.ts`) — cross-hospital 403 on
  info, personnel, hours, media, and announcements.
- **First aid** (`dev-first-aid.test.ts`) — dev gating on create; non-owner
  non-admin 403 on PATCH and DELETE; admins may edit/delete any entry.
- **IHN codes, search helpers, map math, and UI components** — see the remaining
  `__tests__` suites.

## Known gaps

- No end-to-end / browser tests (Playwright/Cypress) — handlers are unit-tested in
  isolation, not exercised through a running server against a live Postgres.
- No load/performance tests for the public search endpoints (see CR2 in
  `docs/SECURITY.md`).
- Frontend page components are only lightly covered (a few form/UI unit tests);
  most rendering is not snapshot- or interaction-tested.
