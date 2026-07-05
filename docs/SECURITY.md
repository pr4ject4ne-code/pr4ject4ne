# Security notes

This file tracks security posture and triaged dependency advisories. The full
security audit (Phase 6) is owned by the security-auditor agent; this is the
running builder-maintained record.

## Baseline controls (implemented as of Phase 0)

- **Parameterized queries only** — `src/lib/db.ts` exposes `query`/`queryOne`/`withTransaction`; all values pass through pg's `$1, $2` binding. An ESLint rule blocks tagged-template SQL.
- **Secrets** — never committed. `.env.local` is gitignored; `.env.example` documents every variable. CI provides only harmless placeholders for build.
- **Security headers** — set in `next.config.mjs` (`X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`).
- **CI** — every push runs lint, type-check, format check, tests, build, and `npm audit --audit-level=critical`.

## Triaged dependency advisories

`npm audit` currently reports advisories that have **no fix available within the
pinned Next.js 14.x line** (upgrading to Next 16 is a breaking change out of
scope for v1). These are triaged as acceptable for the current stage:

| Package | Severity | Advisory | Rationale |
| --- | --- | --- | --- |
| `next` | high | Multiple DoS / cache-poisoning / SSRF advisories (GHSA range covering 9.3.4–16.3.0-canary) | We are pinned to the latest **14.2.x** patch (14.2.35). The advisory version range extends up to Next 16 because a definitive fix only lands there. Most listed vectors (Image Optimizer `remotePatterns`, i18n middleware bypass, `beforeInteractive` scripts) are not used by this app. Revisit when a Next 15/16 migration is scheduled. |
| `postcss` | moderate | XSS via unescaped `</style>` in CSS stringify output (GHSA-qx2v-qp2m-jg93) | Transitive, bundled by Next 14's build toolchain. Not reachable at runtime (build-time CSS processing of our own trusted stylesheets). Fixed by the same Next major upgrade. |
| `glob` | high | CLI command injection via `-c/--cmd` (GHSA-5j98-mcp5-4vw2) | Dev-only, transitive via `eslint-config-next`. The vulnerable code path is the `glob` **CLI** with `--cmd`, which we never invoke. No production exposure. |

CI gates on `--audit-level=critical` so these do not block builds, while any new
**critical** advisory still fails CI. Re-audit on every dependency bump.

## TODO (later phases)

- Rate-limiting on auth and biodata endpoints (Phase 1).
- bcrypt (≥12 rounds) password hashing + HTTP-only session cookies (Phase 1).
- Audit logging on every biodata read/write and dev/hospital action (Phase 1+).
- File upload validation (type/size whitelist) when image storage is wired (Phase 4/5).
- CSP header once inline-script/style usage is finalized.
