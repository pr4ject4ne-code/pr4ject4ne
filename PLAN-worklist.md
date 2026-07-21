# Implementation plan — founder 34-item work list (2026-07-21)

Companion to [WORKLIST.md](WORKLIST.md) (raw items + status). This is the phased execution plan from the planner pass. Item numbers (#1–#34) trace back to WORKLIST.md.

Test/build commands used throughout: `npm test` (mocked), `npm run test:integration` (needs live `DATABASE_URL`), `npm run lint`, `npx tsc --noEmit`, `npm run build` (one at a time — Windows `.next/` race). New migrations always paired with a `.down.sql`.

## Phase 0 — Recon findings (no shipping code)

- **#1 liquid-glass visibility** — needs a live look in a real browser to tell if it's a render bug (e.g. `backdrop-filter: url(#lg-refract)` unsupported in founder's browser) or a "push it further" ask.
- **#4 100vh→80vh** — no `100vh` exists on the hospital-profile page at all, and it has no map. Only the **homepage** map/stage is 100vh. Need founder to confirm which is meant, or if this is actually a new ask (add a mini-map to hospital-profile).
- **#7 can't expand results** — `HospitalMiniProfile` is a navigate-away card *by design* per `homepage.md`. Needs repro: mobile drag-handle, "load more" pagination, or an actual ask to change the spec.
- **#8 symptom search — confirmed broken, not just unbuilt.** `HomeClient.tsx` reads `symptomQuery` from the URL and shows a banner for it, but **never sends `symptom` to `/api/hospitals`**, and the API has zero symptom-matching logic. Full feature needed (bundled into Phase 5).
- **#11 routing** — needs re-repro against current `Map.tsx`; earlier routing fixes (2026-07-12) were verified at the time.
- **#9, #15** — blocked on founder assets (Linktree URL, logo). No action.
- **#32** — too vague ("some static info feels base") — need founder to point at specifics before this is scoped.

## Phase 1 — Quick wins (parallel, disjoint files, no open decisions blocking)
- #12 custom scrollbars (globals.css)
- #31 bolder/sharper font (globals.css font-weight/letter-spacing — decision: bolder system stack, not a typeface swap)
- #20 rename "Biodata Farm" → "Biodata" (grep sweep: dashboard.md, DashboardClient.tsx, tests)
- #5 nav transparency (Header.module.css `.bar`, 80–95% transparent resting, opaque+blur on hover/focus)
- #6 centered search bar (Header.module.css → 3-col grid layout)
- #22 IHN "why it matters" dropdown (copy/UI only)
- #27 optional religion/tribe/ethnicity (religion already optional; add tribe/ethnicity to BiodataLayer + form, no migration — JSONB)

## Phase 2 — Bug fixes (post-repro)
- #7, #11 — exact fix depends on Phase 0 repro.

## Phase 3 — Page-level UI/UX (2 parallel groups)
**Group A (homepage/nav):** #3 inline menu at wide viewports (depends on #6's layout).
**Group B (hospital profile/portal):**
- #2 ratings breakdown (region/national/world — "world" tier undefined for single-country app, need founder call)
- #10 hide doctors for pharmacies/non-doctor types, verified-account opt-in toggle (new column + portal UI)
- #14 department/service structuring for verified accounts (recommend JSONB `departments` column, consistent with existing `hours`/`photos` style)
- #26 footer help bar w/ keyword search
- #28 chronic-disease sub-fields (disease/duration/progression/complication/care/cause) — extend `ClinicalCondition` type + form + **must extend `sanitizeClinicalConditions` whitelist or new fields silently drop** (same bug class fixed once already, 2026-07-12)
- #21 profile photo (reuse existing `PhotoUpload`/`uploadFile` pattern, no new upload path)
- #13 homepage filters: distance/km radius (needs a distance query param, none exists), private/public (needs new schema column, doesn't exist), rating, day-of-week (query existing `hours` JSONB)

**Liquid-glass extension (founder's explicit ask, this session):** every new/touched surface in this phase gets the existing frosted-glass register (`Card.module.css` pattern) + the pointer-tracked sheen already built for `HospitalMiniProfile` — copied, not reinvented. Ultra-transparent map-only refraction stays map-only per the existing design nuance (memory 2026-07-19).

## Phase 4 — Auth/account subsystem (#17, #18, #19) — security-auditor mandatory
- #17 password strength indicator — `validatePasswordStrength` already exists in `lib/validation.ts`, just needs a live green/red UI on signup. Independent, ship anytime.
- #18 email confirmation + welcome email — **no email infra exists at all.** Needs a provider decision (see below), `email_verified` column + verification-token table, signup route changes, verify-email route.
- #19 forgot-password — depends on #18's send capability. New reset-token table (mirrors session hashed-token pattern), rate-limited, enumeration-safe, kills other sessions on reset. Must warn about IHN string at signup + in welcome email per the item text.

## Phase 5 — First Aid rework + symptom search (#8, #33, #34, bundled — shared matching logic)
- #34 schema: add `signs_symptoms` — recommend a whitelist (like the existing 13-tag list), not free text, so "min 2 symptoms" search is deterministic.
- #34 display: signs/symptoms shown before procedure in form + detail view.
- #33 UX/images: move from raw URL-textarea to the existing `PhotoUpload` pattern; layout pass for intuitiveness within existing theme.
- #8 fix + build: fix the dropped `symptom` param, then build ranking against specialties/symptom-tags + distance + rating. **Price and date/time availability don't exist in the schema at all** (no booking module built yet per SPEC.md) — recommend scoping #8 down to specialty-match + distance + rating for v1 unless founder wants to build booking/pricing first.

## Phase 6 — IHN granular sharing + "string" tab + QR (#23, #24, #25) — security-auditor mandatory, highest blast radius
- #23: fixes the long-flagged dead path — `biodata/[userId]` today only allows the owner through, so IHN-code checking is currently unreachable by anyone else. Real fix: allow a different session to read (never write) if IHN matches AND the owner has opted that specific field in (new default-deny sharing-prefs, dashboard toggle UI, response filtered field-by-field, separate rate-limit bucket + audit action for cross-user reads).
- #24: **open decision** — is the "string tab" public (consumes #23's opt-in sharing) or a dev-only bypass tool? Text says both ("homepage tab" + "dev-accessible") but those are different security postures. Recommend: public tab that only ever returns opted-in fields (so it can't override a user's own privacy choice); developers already have DB access for support, a separate bypass tool is a much bigger ask needing its own explicit sign-off.
- #25: QR code of the IHN/lookup URL, once #24 exists. Small, self-contained, client-side.
- Every lookup extensively audit-logged per the item's own requirement, regardless of outcome.

## Phase 7 — Doctor report generation + consent workflow (#29, #30) — security-auditor mandatory, biggest real-world liability risk
- Depends on Phase 6 (report is generated from IHN-shared data).
- **#30 needs a founder decision on the real-world process**, not just code: in-app doctor accounts/login+approval queue (bigger build — no doctor-login concept exists today) vs. admin-recorded process (dev portal records contact + consent outcome manually). Recommend starting with the admin-recorded version for v1 — reuses the existing dev-authority/audit scaffolding — and deferring a self-serve doctor portal.
- #29 report assembly: photo top-right (reuses #21), IHN-shared fields (reuses #23's filtered read, not reimplemented), declaration + doctor signature block **only for fields tied to an approved consent record** — denial must be a first-class tested path, never silently dropped or attributed without consent. Hard test gate: a report cannot include doctor attribution without a checked, approved consent record.

## Sequencing notes
- Phase 4 should land before Phase 6/7 (both touch `users`-adjacent schema — avoid migration-ordering conflicts).
- Phase 6 → Phase 7 is strictly sequential.
- Phase 1, Phase 3, Phase 5 can otherwise run in parallel to each other.

## Open decisions — need founder input, not guessable
1. **Email provider for #18/#19.** Recommend **Resend** (no-card free tier, 3k/mo) — consistent with the standing pattern of avoiding billing signups (same reasoning behind MapTiler/OSRM over Mapbox/ORS, and staying on Supabase Storage over Cloudflare R2). Proceeding with this unless told otherwise.
2. **#4 — which 100vh→80vh?** No 100vh exists on hospital-profile; only the homepage map is 100vh today.
3. **#8 — price/availability ranking.** Schema has no price field and no booking/date-time system. Scoping down to specialty+distance+rating for v1 unless you want the booking/pricing module built first.
4. **#24 — string tab: public (opt-in-only) or dev-only bypass tool?** Recommend public/opt-in-only; treating that as the default unless told otherwise.
5. **#30 — doctor consent process.** Recommend admin-recorded (dev portal), not a doctor self-serve login, for v1.
6. **#2 — "world" ranking tier** doesn't map to anything for a single-country app yet; recommend dropping it for v1 (region + national only) unless it's meant as a placeholder for future expansion.

Items 1, 3, 5, 6 above I'm proceeding with the recommended default — flag if you want something different. Items 2 and 4 genuinely need your call before Phase 3/6 can be scoped precisely.

## Risks (from planner)
- #23/#24/#25/#29/#30 modify the one auth boundary every prior audit praised as correct — must ship default-deny, independently tested, not just "trust the prefs object."
- #18/#19 add the first outbound network dependency (email) — needs timeout + graceful degradation, and the new provider API key must not be pasted into chat (repeat of the DB password/service_role/909018 pattern already burned once this project).
- #14/#34 schema changes touch live Neon data — additive/reversible migrations only, tested against a scratch DB first.
- #8's price/availability gap is easy to under-deliver silently — must be explicit in the build ticket that it's scoped down pending decision #3.
- #29's doctor-attribution-without-consent case is the one true legal-liability risk on this list — hard test gate required before shipping.
