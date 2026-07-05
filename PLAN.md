# Racoon Eye v1 — Implementation Plan

**Status:** Approved for builder handoff (2026-07-05)

---

## Executive Summary

Racoon Eye v1 is a responsive web app (mobile-first) enabling Nigerian clinics and patients to discover hospitals, manage patient biodata securely via an IHN code (shareable for emergency access), and access developer-managed first-aid guidance. The MVP focuses on three core modules: (1) hospital search/directory with self-registration (two-tier: verified institutional accounts + community-managed with dev curation), (2) patient authentication and the Biodata Farm (two-layer profile with static IHN access code), and (3) developer-managed first-aid catalog with a simple suggestions dashboard for community feedback. Phasing completes foundational infrastructure first (Phase 0–1), then parallelizes UI work across multiple independent modules (Phases 2–4), adds institutional hospital management (Phase 5), and gates launch on security/testing (Phase 6).

---

## Phase 0: Scaffold, CI/CD, and local setup

**Duration:** 1–2 sprints  
**Dependencies:** None  
**Parallelizable:** No (foundation for all other work)

### Files to create/modify

- `package.json` — Next.js + TypeScript + dev tooling (ESLint, Prettier, Jest, Playwright)
- `tsconfig.json` — TypeScript strict mode, absolute imports
- `.eslintrc.js`, `.prettierrc` — code style (security-focused linting)
- `.env.example` — template for all env vars (database URL, session secret, etc.)
- `env.local` (gitignored) — local dev secrets
- `Dockerfile`, `docker-compose.yml` — local PostgreSQL + app container
- `.github/workflows/ci.yml` — GitHub Actions: lint + test + security scan on every push
- `src/` — app root (Next.js app router structure)
- `src/lib/db.ts` — PostgreSQL connection pool + parameterized query helpers
- `src/middleware.ts` — session/auth middleware skeleton
- `README.md` — setup instructions, env vars, how to run locally, how to run tests
- `.gitignore` — exclude `.env.local`, node_modules, build artifacts, sensitive files

### Key tasks

1. Initialize Next.js 14+ repo with TypeScript + App Router
2. Set up PostgreSQL local dev environment (Docker Compose)
3. Configure TypeScript strict mode + absolute imports (`@/components`, `@/lib`, etc.)
4. Wire up ESLint (security-focused config, no hardcoded secrets, SQL injection checks)
5. Set up Prettier for consistent formatting (sans-serif font enforcement in CSS rules)
6. Create database connection module with parameterized query helpers (prevent SQL injection)
7. Set up GitHub Actions CI pipeline: on every push, run lint → test → security audit
8. Document all required env vars in `.env.example` with descriptions
9. Create initial README with: setup instructions, build/test/dev-server commands, database migration steps
10. Configure `.gitignore` to exclude `.env.local`, secrets, build artifacts

### Verification commands

```bash
npm run dev
# App runs on http://localhost:3000 with live reload

npm run build
npm run lint
# No errors or warnings

docker compose up -d
# PostgreSQL starts on localhost:5432, accessible via psql or GUI tools

npm run test
# Test suite runs (initially empty, will grow with each phase)
```

### Security touchpoints

- Environment variables must never be committed; `.env.example` documents all required vars with descriptions only
- Database connection module must use parameterized queries only (no string interpolation)
- GitHub Actions workflow must not have plaintext secrets; use GitHub Secrets for real credentials
- `.gitignore` must exclude sensitive files (.env.local, private keys, node_modules)

---

## Phase 1: Core backend (auth, data models, base APIs)

**Duration:** 2–3 sprints  
**Dependencies:** Phase 0  
**Parallelizable:** Once schema is locked, hospital/biodata/first-aid API modules can be built in parallel

### Files to create/modify

- `migrations/001_initial_schema.sql` — all tables: users, hospitals, biodata, first_aid_entries, audit_logs, suggestions
- `src/lib/db.ts` — extend with migration runner and schema initialization
- `src/types/index.ts` — TypeScript types for all models (User, Hospital, Biodata, FirstAidEntry, Suggestion, etc.)
- `src/lib/auth.ts` — password hashing (bcrypt), session/token generation, verification
- `src/lib/ihn-code.ts` — IHN code generation (static, never rotates; explain in docs as "emergency access key")
- `src/pages/api/auth/signup.ts` — patient signup endpoint
- `src/pages/api/auth/login.ts` — patient login endpoint
- `src/pages/api/auth/logout.ts` — logout endpoint
- `src/pages/api/auth/verify.ts` — session verification (used by middleware)
- `src/pages/api/hospitals/index.ts` — GET list (paginated) + POST (institution registration)
- `src/pages/api/hospitals/[id].ts` — GET single hospital by ID
- `src/pages/api/hospitals/[id]/suggestions.ts` — POST suggestion, GET suggestions (for community feedback)
- `src/pages/api/biodata/[userId].ts` — GET/PATCH patient biodata (protected by IHN code + session)
- `src/pages/api/first-aid/entries.ts` — GET list (public, paginated)
- `src/lib/middleware/requireAuth.ts` — session validation middleware
- `src/lib/audit.ts` — centralized logging for data access, biodata reads/writes, developer actions

### Schema highlights

**users table:**
- id, email (unique), password_hash, account_type (patient|hospital_staff|developer), created_at, updated_at
- Patient users: minimal fields
- Hospital staff users: linked to hospital_id, verified flag
- Developer users: access_level, last_login, created_by

**hospitals table:**
- id, name, address, website, contact_info, logo_url, verified (boolean), account_id (nullable, NULL = community-managed), created_at, updated_at
- Verified hospitals: account_id links to a hospital_staff user account
- Community-managed hospitals: account_id is NULL, data seeded by dev

**biodata table:**
- user_id, profile_layer (JSON: name, alias, gender, phone, email, dob, dob_visible, next_of_kin), biodata_layer (JSON: chronic_disease, occupation, marital_status, religious_status, height_cm, weight_kg, waist_cm, chest_cm, hip_cm, genotype, blood_group, clinical_conditions, disability, health_preferences), ihn_code (static), last_modified_at, accessed_at, accessed_by_ihn_code (for audit)

**first_aid_entries table:**
- id, category (procedure|technique), title, definition, description, process, dos, donts, things_to_look_out_for, implications, indication, contraindications, images (JSON: array of URLs), created_by_dev_id, created_at, updated_at

**suggestions table:**
- id, hospital_id, submitted_by_email, content, category (data_correction|photo|hours|personnel|other), status (new|reviewed|applied|dismissed), applied_to_field (nullable), reviewed_by_dev_id (nullable), reviewed_at (nullable), created_at

**audit_logs table:**
- id, user_id, action_type (biodata_read|biodata_write|hospital_update|first_aid_upload|dev_action), resource_type, resource_id, details (JSON), timestamp

### Key tasks

1. Design and write reversible migrations (include rollback for each)
2. Implement bcrypt hashing for passwords (salt rounds ≥12) + session token generation (cryptographically random)
3. Implement IHN code generation (e.g., random 12-char alphanumeric, `IHN-XXXX-XXXX-XXXX` format) with explanation: "static access key, shareable with close relatives/friends for emergency access"
4. Build patient signup: email validation (confirm doesn't exist), hash password, create user record, generate IHN code, initialize empty biodata layers
5. Build patient login: verify email + password, create session token, set secure HTTP-only cookie
6. Build session verification middleware: check token validity, return user ID + account_type, rate-limit failed login attempts
7. Implement hospital registration flow: validate input (name, address, contact), determine if verified (has account) or community-managed, store logo_url (stub for now, storage TBD)
8. Implement hospital GET by ID: return full details (photos, personnel, announcements, availability)
9. Implement hospital list (paginated): filter by location, speciality, verification status
10. Implement biodata GET: require session + IHN code in header, return user's biodata, log access
11. Implement biodata PATCH: require session + IHN code in header, update profile or biodata layer, log modification
12. Implement first-aid entry GET (public, paginated): category filter, search by title/definition
13. Implement suggestions POST: accept hospital_id, content, category, email (optional); store in suggestions table
14. Implement suggestions GET (dev only): return all suggestions for a hospital (or all if admin), status filter
15. Write unit tests for auth functions (password hashing, token generation, IHN code generation, validation)
16. Write integration tests for each API endpoint (signup, login, biodata access, hospital CRUD, first-aid read)

### Verification commands

```bash
npm run test -- src/lib/auth.test.ts
npm run test -- src/lib/ihn-code.test.ts
npm run test -- src/pages/api/auth/
npm run test -- src/pages/api/hospitals/
npm run test -- src/pages/api/biodata/

# Manual curl tests:
curl -X POST http://localhost:3000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"patient@test.com","password":"SecurePass123!"}'
# Response: { success: true, ihn_code: "IHN-XXXX-XXXX-XXXX" }

curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"patient@test.com","password":"SecurePass123!"}'
# Response: { success: true, session_token: "..." } (cookie set)

curl -X GET http://localhost:3000/api/hospitals?location=Enugu&limit=10
# Response: { hospitals: [...], total: X, page: 1 }

curl -X GET http://localhost:3000/api/biodata/1 \
  -H "Cookie: session=..." \
  -H "X-IHN-Code: IHN-XXXX-XXXX-XXXX"
# Response: { profile_layer: {...}, biodata_layer: {...} }
```

### Security touchpoints

**MANDATORY security-auditor review before Phase 2 starts:**
- Password hashing: bcrypt with ≥12 salt rounds, no plaintext passwords in logs
- Session tokens: cryptographically random (crypto.randomBytes), stored in secure HTTP-only cookies, never in localStorage
- IHN code: generation (random alphanumeric), static (never rotates), rate-limiting on biodata access attempts (max 10/min per user)
- Input validation: email format, password strength (≥8 chars, mixed case, number, symbol), SQL injection prevention via parameterized queries
- Audit logging: every biodata read/write logged with timestamp, user ID, IHN code used, IP (if available)
- CORS: secure defaults (no `*`, specific origins only)
- Row-level security: users can only access their own biodata; hospital staff can only modify their own hospital
- Secrets: all sensitive env vars (database URL, session secret) stored in `.env.local` or GitHub Secrets, never in code/git

---

## Phase 2: Public frontend (shared components, homepage, hospital profile, filter page)

**Duration:** 2–3 sprints  
**Dependencies:** Phase 1  
**Parallelizable:** YES — once shared components (theme, header, footer) are done, homepage, hospital profile, and filter page can be built in parallel by 3 separate builders

### Files to create/modify

**Shared components & theme:**
- `src/components/Layout.tsx` — top bar + footer wrapper
- `src/components/Header.tsx` — logo, 3-mode search bar (nearest hospital | specific hospital | symptoms), hamburger menu
- `src/components/Footer.tsx` — logo right, privacy/T&Cs/link-tree links left
- `src/components/Button.tsx`, `src/components/Card.tsx`, `src/components/Input.tsx`, `src/components/Dropdown.tsx`, `src/components/Modal.tsx` — reusable UI primitives
- `src/styles/theme.ts` — CSS variables: --color-blue (matte), --color-white, --color-amethyst (matte), --font-sans (default sans-serif)
- `src/styles/globals.css` — enforce theme rules: no gradients blending into white, no blue/amethyst text on white backgrounds

**Homepage:**
- `src/pages/index.tsx` — full-screen interactive map + hospital mini-profiles
- `src/components/Map.tsx` — Leaflet.js + OpenStreetMap tiles initialization
- `src/components/SearchBar.tsx` — 3-mode search (nearest hospital via geolocation, search by hospital name, search by symptoms)
- `src/components/HospitalMiniProfile.tsx` — collapsible card (name, photos, address, specialities, hours) → click → navigate to /hospitals/[id]
- `src/lib/map.ts` — Leaflet.js + OSRM routing integration (calculate route, ETA, availability annotations)
- `src/lib/geolocation.ts` — browser geolocation wrapper (graceful fallback if denied)
- Tests: `src/components/__tests__/Map.test.tsx`, search bar tests, integration tests for map rendering

**Hospital profile page:**
- `src/pages/hospitals/[id].tsx` — hospital details layout
- `src/components/HospitalGallery.tsx` — 5-photo gallery (outside far, outside close, reception, 2 others)
- `src/components/HospitalInfo.tsx` — name, address, website, contact
- `src/components/HospitalHours.tsx` — times of service and visit
- `src/components/AnnouncementCalendar.tsx` — calendar with color-coded announcements (green=light, yellow=intermediate, red=urgent), announcement bar above
- `src/components/DoctorRoster.tsx` — dropdown list of doctors, filterable by specialty or alphabetical, display name/specialty/level, show ratings
- `src/lib/hospital-search.ts` — hospital-specific search logic (search within this hospital's info/services)
- Tests: component rendering, navigation, data loading

**Filter page:**
- `src/pages/filter.tsx` — advanced search/filter interface
- `src/components/FilterForm.tsx` — filters: service type (hospital/clinic/pharmacy/radiology/other), location, specialty, rating threshold, availability (open now | 24-hour)
- `src/components/ResultsList.tsx` — list view of matching services (cards with name, type, address, contact, hours, rating, link to profile)
- `src/lib/filter-search.ts` — query API with filter parameters, handle pagination
- Tests: filter logic, results rendering, pagination

### Key tasks (shared first)

1. Design and implement theme system: CSS variables for matte blue, white, amethyst (no glossy/gradient effects)
2. Enforce theme rules in globals.css: no gradients blending colors into white, no blue/amethyst text directly on white (audit every color combination)
3. Build Layout component: top bar (Header) + page content + footer
4. Build Header: logo left, hamburger menu right, search bar center-left
5. Build hamburger menu: expands to show "Profile" link (goes to /login if not authenticated, /dashboard if authenticated) and "First Aid" link
6. Build Footer: shared component with logo right, links left (privacy, T&Cs, link-tree)
7. Create reusable component library (Button, Card, Input, Dropdown, Modal, etc.) — all respecting theme
8. Set up Leaflet.js + OpenStreetMap on full-screen canvas (100vw x 100vh)

**Homepage (can start in parallel once shared components done):**
9. Integrate Leaflet.js map: display OSM tiles, allow drag/zoom, center on user location (if geolocation granted)
10. Build 3-mode search bar: (a) "Nearest hospital" — use geolocation + API to find closest, (b) "Search hospital" — text search by name, (c) "Search symptoms" — accept symptom input (stub for now, may be placeholder or basic text search)
11. Implement geolocation wrapper: request permission, return lat/long, graceful fallback (show UI asking for manual location entry)
12. Integrate OSRM routing: for each matched hospital, calculate route from user location, fetch ETA, display on map
13. Draw hospitals on map with markers, include ETA + availability info on each marker
14. Build HospitalMiniProfile cards: show below map, collapsible, display name/photos/address/specialties/hours → click → navigate to hospital-profile page
15. Wire homepage to Phase 1 APIs: call GET /hospitals, GET /hospitals/[id], filter by location/speciality/rating
16. Implement pagination on results (show X hospitals at a time, "Load more" button)
17. Add "Suggestion tab" (email feedback affordance) on homepage

**Hospital profile (can start in parallel once shared components done):**
18. Build 5-photo gallery: outside far, outside close, reception, 2 others (navigate gallery, captions)
19. Display hospital info: name, address (clickable map), website (link), contact (phone/email clickable)
20. Display times of service and visit (format: table or list, per-day or combined)
21. Build calendar component: month view, show dates with announcements, color-coded (green/yellow/red)
22. Display announcement bar above calendar: show highest-priority or most recent announcement
23. Build doctor roster dropdown: list doctors, filterable by specialty or sortable alphabetically; show name/specialty/level/rating for each
24. Implement hospital-specific search: search bar only searches within this hospital's info/services (not global)
25. Add "Suggestion tab" (email feedback affordance) on hospital profile page
26. Wire to Phase 1 API: GET /hospitals/[id], GET /hospitals/[id]/suggestions (display suggestion count), ratings endpoint (if available)

**Filter page (can start in parallel once shared components done):**
27. Build filter form: checkboxes/dropdowns for service type, text input for location, dropdown for specialty filter, rating slider, availability toggle (open now | 24-hour)
28. Implement results display: list of service cards (name, type icon, address, contact, hours, rating, link to profile)
29. Add pagination (show X results per page, "Load more" or pagination controls)
30. Optional: add map view toggle (show results on map instead of list)
31. Wire to Phase 1 API: POST /hospitals/search or GET /hospitals?type=...&location=...&specialty=... with pagination
32. Add "Suggestion tab" (email feedback affordance) on filter page

### Verification commands

```bash
npm run dev
# Navigate to http://localhost:3000
# Check: theme applied (matte colors, no gradients, sans-serif font)
# Check: map loads on homepage (visible OSM tiles, interactive)
# Check: click "Nearest hospital" → geolocation prompt appears (if not granted, manual entry option)
# Check: search bar shows 3 modes (nearest, by name, by symptoms)
# Check: search results appear on map with ETA annotations
# Check: click mini-profile card → navigates to /hospitals/[id]
# Check: hospital profile shows 5 photos, info, calendar with color-coded announcements, doctor roster
# Check: doctor roster dropdown filters by specialty/alphabetical
# Check: /filter page loads, filters work, results display with pagination
# Check: suggestion tab appears on all pages, email link/button works

npm run test -- src/components/
npm run test -- src/pages/index.tsx
npm run test -- src/pages/hospitals/
npm run test -- src/pages/filter.tsx

# Lighthouse audit for performance and accessibility
npm run build && npx lighthouse http://localhost:3000
```

### Security touchpoints

- Geolocation: optional user permission, graceful fallback if denied; no forced tracking
- OSRM routing: public demo server, acceptable rate-limiting for MVP (no billing concerns)
- Hospital data: public read-only, no injection risks if API returns JSON only
- **Code-reviewer will check:** no N+1 queries, pagination on large result sets, no performance regressions on map rendering

---

## Phase 3: Patient dashboard (login flow, Biodata Farm, calendar)

**Duration:** 2 sprints  
**Dependencies:** Phase 1 (auth API), Phase 2 (shared components/header/footer)  
**Parallelizable:** Can start once Phase 2 header/footer are complete; independent from homepage/hospital/filter work

### Files to create/modify

- `src/pages/login.tsx` — unified login/signup form (email + password)
- `src/pages/dashboard/index.tsx` — main dashboard: "Recent" section (stub for now) + expandable calendar
- `src/pages/dashboard/profile.tsx` — or inline component: the Biodata Farm
- `src/components/LoginForm.tsx` — reusable login/signup form
- `src/components/BioDataForm.tsx` — two-layer form (Profile layer + Biodata layer) with all fields
- `src/components/IHNCodeDisplay.tsx` — display current IHN code with explanation (shareable for emergency access), not changeable (static)
- `src/components/Calendar.tsx` — plain calendar overlay (month/week view, no queue logic yet)
- `src/lib/ihn-code.ts` — (already in Phase 1) IHN code display/explanation
- `src/pages/api/auth/session.ts` — endpoint to get current session user (for dashboard hydration)
- Tests: login flow, signup, biodata CRUD, session management

### Key tasks

1. Build login form: email + password fields, validation, submit to Phase 1 login API
2. Build signup form: email, password, password confirmation, terms checkbox, validation (email unique, password strong ≥8 chars)
3. Wire session handling: on successful login, store session token in secure HTTP-only cookie, redirect to /dashboard
4. Implement logout: clear session cookie, redirect to /
5. Build dashboard layout: header + "Recent" section (stub for now, e.g., "No recent activity") + expandable calendar
6. Build calendar component: plain month or week view (no queue/booking logic, just a calendar), clickable dates (no action, just visual)
7. Build Biodata Farm form with two sections:
   - **Profile layer** (compulsory, freely visible):
     - Full name (required)
     - Alias (optional, shown under name)
     - Gender (required, dropdown or radio)
     - Phone (required)
     - Email (required)
     - Date of birth (required, with "hide in profile" checkbox for privacy)
     - Next of kin contact (required)
     - Address (optional)
   - **Biodata layer** (locked by IHN code, optional but recommended):
     - Patient-filled:
       - Chronic disease
       - Occupation
       - Marital status
       - Religious status
     - Anthropometric measurements (patient-filled):
       - Height (cm)
       - Weight (kg)
       - Waist circumference (cm)
       - Chest circumference (cm)
       - Hip circumference (cm)
       - BMI (calculated/display-only from height + weight)
     - Recommended official fields (optional, preferably from lab reports/doctor records):
       - Genotype
       - Blood group
       - Clinical conditions (with timestamp, free-text cause field)
       - Disability
       - Health preferences
8. Display IHN code: show current code (never rotate), include explanation: "Your emergency access key. Share with close relatives/friends to allow them to view your biodata in an emergency. This code never changes."
9. Wire biodata GET: on dashboard load, call GET /biodata/[userId] (require session + IHN code in header), populate form with existing data
10. Wire biodata PATCH: on form submit, call PATCH /biodata/[userId] (require session + IHN code in header), update both layers if changed
11. Implement form validation: all compulsory fields required, email format, phone format (local validation + server-side)
12. Add "Suggestion tab" (email feedback affordance) on login and dashboard pages
13. Write unit tests for form validation, IHN code display, session handling

### Verification commands

```bash
npm run dev

# Test signup:
# Navigate to http://localhost:3000/login
# Click "Sign up" → fill form (email, password, confirm password, agree to T&Cs) → submit
# Verify: user record created in DB, IHN code generated, redirects to /dashboard

# Test login:
# Navigate to http://localhost:3000/login
# Enter valid email + password → submit
# Verify: session cookie set, redirects to /dashboard, user data loads

# Test biodata form:
# On dashboard, check all Profile layer fields render (name, alias, gender, phone, email, DOB, DOB-visibility toggle, next-of-kin, address)
# Check all Biodata layer fields render (chronic disease, occupation, marital status, religious status, anthropometric measurements, recommended fields)
# Fill some fields, submit → verify API call made to PATCH /biodata
# Refresh page → verify data persists

# Test IHN code display:
# On dashboard profile section, verify IHN code shown
# Verify explanation text: "Your emergency access key. Share with close relatives/friends..."
# Verify code is NOT changeable (no "rotate" or "change" button)

# Test calendar:
# On dashboard, click to expand calendar → verify month view appears, interactive, but no queue/booking logic

npm run test -- src/pages/dashboard
npm run test -- src/pages/login.tsx
npm run test -- src/components/BioDataForm.tsx
```

### Security touchpoints

**MANDATORY security-auditor review:**
- Password strength: enforce minimum complexity on signup (≥8 chars, mixed case, number, symbol)
- Session timeout: auto-logout after inactivity (configurable, ~15–30 min default)
- IHN code: static (never rotates), rate-limit biodata access attempts (max 10/min per user)
- Biodata access: every read/write logged with timestamp, IHN code used, user ID (via Phase 1 audit_logs)
- DOB visibility: respect user's privacy toggle (if DOB_visible = false, don't return DOB to unauthorized viewers in later phases)
- Form validation: all inputs sanitized (no XSS), SQL injection prevention via parameterized queries (Phase 1 handles this)
- HTTPS only: secure cookie flag set (`Secure; HttpOnly; SameSite=Strict`)
- CSRF protection: consider SameSite cookie + CSRF token on form submissions

---

## Phase 4: First Aid (public catalog + developer section)

**Duration:** 1–2 sprints  
**Dependencies:** Phase 1 (first-aid API, developer auth), Phase 2 (shared components)  
**Parallelizable:** Public catalog and developer section can be built in parallel

### Files to create/modify

**Public catalog:**
- `src/pages/first-aid/index.tsx` — read-only catalog list view
- `src/pages/first-aid/[id].tsx` — entry detail page
- `src/components/FirstAidList.tsx` — list of entries with category filter (Procedures | Techniques) and search
- `src/components/FirstAidDetail.tsx` — full entry display: all fields, photo gallery
- `src/lib/first-aid-search.ts` — search/filter logic for entries
- Tests: listing, detail view, filtering, search

**Developer section (disconnected from main site):**
- `src/pages/dev/login.tsx` — developer login (separate from patient login, not linked from main site)
- `src/pages/dev/dashboard.tsx` — developer portal main hub
- `src/pages/dev/first-aid.tsx` — upload/edit/delete first-aid entries
- `src/pages/dev/primary.tsx` — primary dev management page (account mgmt, access control, audit logs, suggestions dashboard)
- `src/components/FirstAidForm.tsx` — upload form with fields: picture(s), definition, description, process, do's, don'ts, things to look out for, implications, indication, contraindications, category (Procedure | Technique)
- `src/components/SuggestionsBoard.tsx` — simple list of suggestions (by hospital, status filter, click to mark reviewed/applied)
- `src/lib/dev-auth.ts` — developer session logic (separate from patient auth)
- `src/pages/api/dev/accounts.ts` — create/revoke/reset developer credentials (admin only)
- `src/pages/api/dev/audit-logs.ts` — fetch audit logs (dev actions: uploads, edits, deletes)
- Tests: dev login, entry upload, access control, audit logging

### Key tasks (public catalog)

1. Build first-aid catalog list: display all entries in two categories (Procedures | Techniques)
2. Implement category filter: show Procedures only, Techniques only, or all
3. Implement search: search by title, definition, or keywords
4. Implement pagination: show X entries per page, "Load more"
5. Build entry card: show title, category, thumbnail (first image if available), short definition preview
6. Build detail view: full entry with all fields (definition, description, process, do's/don'ts, things to look out for, implications, indication, contraindications), photo gallery
7. Add clinical disclaimer on every page: "This is educational reference only and should not replace professional medical advice. Always consult a qualified healthcare provider. This guidance is not provided under law."
8. Reference disclaimer in Terms & Conditions (link on footer)
9. Add "Suggestion tab" (email feedback affordance) on catalog pages
10. Wire to Phase 1 API: GET /first-aid/entries (paginated, category/search filters)

**Developer section:**
11. Build developer login page: email + password (credentials generated by primary-dev-page, delivered out-of-band, not in code/git)
12. Implement developer session: separate from patient session, timeout policy (~30 min), rate-limit failed login attempts
13. Build developer dashboard: hub with links to upload form, entry management, suggestions board, account settings (if any)
14. Build entry upload form: picture upload(s) (storage TBD, use local for dev), definition, description, process, do's, don'ts, things to look out for, implications, indication, contraindications, category selection (Procedure | Technique), submit to Phase 1 API
15. Implement entry management: show all entries uploaded by this developer, edit/delete buttons (with confirmation), view-only for entries uploaded by other developers
16. Log all dev actions: on every upload/edit/delete, POST to Phase 1 audit-logs (timestamp, dev ID, action type, entry ID, description)
17. Build primary dev management page:
    - **Account management:** list all developer accounts, create new (generate credentials, display once, dev must save), revoke (disable account immediately), reset password (issue temporary password/link)
    - **Audit log viewer:** searchable/filterable log of all dev actions across the platform (uploads, edits, deletes, account changes, etc.), export option (TBD)
    - **Suggestions dashboard:** simple list of all suggestions (grouped by hospital, status filter: new | reviewed | applied | dismissed), click suggestion to expand, mark as reviewed, click "Apply" to note it was applied (dev manually makes updates to community-managed hospital data based on suggestion; this is just logging the intent)
    - **Access control assignment:** if role-based access needed (e.g., "first-aid-editor" vs. "admin"), show assignment UI (TBD if needed for v1)
18. Ensure primary dev page is NOT linked from main site (no navigation link on header/footer/homepage)
19. Add "Suggestion tab" (email feedback affordance) on dev pages (if appropriate, optional for v1)
20. Wire dev endpoints to Phase 1 API: POST /first-aid/entries (create), PATCH (edit), DELETE (delete)

### Verification commands

```bash
npm run dev

# Public catalog:
# Navigate to http://localhost:3000/first-aid
# Check: list of entries appears, category filter works (Procedures | Techniques)
# Check: search bar works (search by title/definition)
# Check: pagination works ("Load more" or page controls)
# Check: click entry → navigates to /first-aid/[id], shows all fields + photo gallery
# Check: disclaimer displayed on catalog page and detail page
# Check: "Suggestion tab" appears and email link/button works

# Developer section (not linked from main site):
# Manually navigate to http://localhost:3000/dev/login (or use a direct link provided separately)
# Check: login page appears (NOT accessible from main site navigation)
# Log in with developer credentials (generated by admin)
# Check: redirects to /dev/dashboard
# Check: upload form renders with all fields (picture, definition, description, process, do's, don'ts, etc.)
# Upload an entry → verify created in DB, appears in /first-aid (public)
# Check: edit/delete buttons available for own entries
# Check: /dev/primary shows:
#   - Developer accounts list, create/revoke/reset buttons
#   - Audit log viewer (searchable, filterable)
#   - Suggestions dashboard (list by hospital, status filter, mark reviewed/applied)
# Create new developer account → verify credentials generated and displayed once
# Submit a suggestion (as a patient) → verify appears in suggestions dashboard
# Mark suggestion as reviewed/applied → verify status changes in dashboard (logged to audit)

npm run test -- src/pages/first-aid
npm run test -- src/pages/api/first-aid
npm run test -- src/pages/dev/
npm run test -- src/lib/dev-auth
```

### Security touchpoints

**MANDATORY security-auditor review:**
- Developer credentials: stored securely (bcrypt ≥12 salt rounds), never in code/git, delivered via env vars or secure credential manager
- Developer session: separate from patient/hospital session, timeout policy (~30 min), rate-limit failed login attempts (max 5/5 min)
- Access control: middleware enforces only authenticated developers can POST/PATCH/DELETE entries; check via session + role
- Audit logging: every dev action logged to Phase 1 audit_logs table (timestamp, dev ID, action type, entry ID, description); retained for compliance
- Primary dev page: not discoverable from main site UI (no link on header/footer/homepage); requires direct URL or separate admin entry point; consider hardened login (MFA, IP whitelisting, if feasible for v1)
- File uploads (pictures): validate file type (whitelist: jpeg, png, webp), validate file size (max 5MB per image), store outside web root (S3 or local server, storage TBD), serve with correct MIME types, no execution (no .exe, .php, etc.)
- Clinical disclaimer: wording must NOT make diagnosis claims, only state "educational reference only, not a substitute for professional advice"; reviewed by founder/legal counsel before public launch
- Rate-limiting: consider rate-limit on upload endpoint (e.g., max 10 entries per dev per hour) to prevent spam
- Input sanitization: all text fields (definition, description, process, etc.) sanitized to prevent XSS; HTML tags stripped or escaped

---

## Phase 5: Hospital management portal (institution backend)

**Duration:** 2 sprints  
**Dependencies:** Phase 1 (hospital API with PATCH endpoints), Phase 2 (shared components/header)  
**Parallelizable:** Independent from patient/dev/public work; can be built in parallel with Phase 4

### Files to create/modify

- `src/pages/hospital/login.tsx` — institution staff login (separate from patient/dev login)
- `src/pages/hospital/dashboard.tsx` — main portal hub
- `src/pages/hospital/media.tsx` — upload/manage 5 photos
- `src/pages/hospital/info.tsx` — edit hospital info (name, address, website, contact)
- `src/pages/hospital/hours.tsx` — set operating hours / times of service and visit
- `src/pages/hospital/announcements.tsx` — add/edit/delete announcements, color-code (green/yellow/red), manage announcement bar
- `src/pages/hospital/personnel.tsx` — manage doctor roster (add/edit/remove doctors, set name/specialty/level)
- `src/components/PhotoUpload.tsx` — upload single or multiple photos, preview, delete
- `src/components/AnnouncementForm.tsx` — form to add/edit announcement with color selection
- `src/components/DoctorForm.tsx` — form to add/edit doctor (name, specialty dropdown, level dropdown)
- `src/lib/hospital-auth.ts` — hospital staff session logic (separate from patient/dev auth)
- `src/pages/api/hospital/[id]/media.ts` — POST/DELETE photo (extend Phase 1 hospital CRUD)
- `src/pages/api/hospital/[id]/info.ts` — PATCH hospital info
- `src/pages/api/hospital/[id]/hours.ts` — PATCH hours
- `src/pages/api/hospital/[id]/announcements.ts` — POST/PATCH/DELETE announcements
- `src/pages/api/hospital/[id]/personnel.ts` — POST/PATCH/DELETE doctors
- Tests: hospital auth, data isolation, CRUD operations, audit logging

### Key tasks

1. Build hospital staff login page: email + password (credentials set during partner-registration in Phase 1)
2. Implement hospital staff session: separate from patient/dev session, timeout policy (~30 min), rate-limit failed login attempts
3. Build hospital dashboard: hub with navigation to media, info, hours, announcements, personnel sections
4. Build media manager: upload/organize 5 photos (outside far, outside close, reception, 2 others), drag-to-reorder, delete, preview
5. Build info editor: update name, address, website, contact (phone/email) — all fields except hospital ID
6. Build hours editor: set operating hours (format: table or per-day input, e.g., "Mon: 09:00–17:00, Tue: 09:00–17:00, etc."), support multiple time slots if needed
7. Build announcements manager: add/edit/delete announcements, date picker, color-code (green/yellow/red), mark as "announcement bar" (only one announcement can be the bar at a time)
8. Build personnel manager: add/edit/remove doctors from roster, form to set name, specialty (dropdown, sourced from Phase 1 taxonomy), level (dropdown: consultant | senior registrar | registrar | intern | other)
9. Implement read-only doctor ratings display: show aggregate patient ratings for each doctor (data populated by patients rating doctors on hospital-profile page in Phase 2)
10. Display all changes in audit trail: every edit (media upload, info change, announcement, personnel add/edit/delete) logged with timestamp, staff ID, hospital ID, field changed, new value
11. Enforce strict data isolation: hospital staff can only see/edit their own hospital's data (middleware checks hospital_id from session matches hospital_id in request)
12. Wire all CRUD to Phase 1 API endpoints: POST/PATCH/DELETE for media, info, hours, announcements, personnel
13. Add confirmation dialogs for destructive operations (delete photo, delete announcement, remove doctor)
14. Write integration tests for hospital auth, data isolation, CRUD operations

### Verification commands

```bash
npm run dev

# Hospital staff login:
# Navigate to http://localhost:3000/hospital/login
# Enter hospital staff email + password → submit
# Verify: separate session from patient login, redirects to /hospital/dashboard

# Hospital dashboard:
# On /hospital/dashboard, verify hub layout with navigation to media/info/hours/announcements/personnel

# Media manager:
# Navigate to /hospital/media
# Upload 5 photos (outside far, outside close, reception, 2 others)
# Verify: photos stored, preview thumbnails shown, drag-to-reorder works (optional), delete button removes photo
# Verify: changes reflected on hospital-profile page (/hospitals/[id])

# Info editor:
# Navigate to /hospital/info
# Edit name, address, website, contact → submit
# Verify: changes persist, reflected on hospital-profile page

# Hours editor:
# Navigate to /hospital/hours
# Set operating hours (e.g., "Mon–Fri: 09:00–17:00, Sat: 09:00–14:00, Sun: Closed")
# Verify: format editable and clear, changes persist, reflected on hospital-profile page

# Announcements:
# Navigate to /hospital/announcements
# Add announcement (text, date, color green/yellow/red) → submit
# Verify: appears on hospital-profile page calendar with correct color
# Mark as "announcement bar" → verify appears in announcement bar on hospital-profile page (only one bar at a time)
# Edit/delete announcement → verify changes persist

# Personnel:
# Navigate to /hospital/personnel
# Add doctor (name, specialty dropdown, level dropdown) → submit
# Verify: appears on hospital-profile page doctor roster, can be rated by patients
# Edit/delete doctor → confirm dialog, verify changes persist

# Data isolation:
# Create 2 hospital staff accounts (different hospitals)
# Log in as hospital A staff, verify cannot see hospital B data (403 or empty results)
# Log in as hospital B staff, verify cannot see hospital A data

# Audit trail:
# Every edit should be logged with timestamp, staff ID, hospital ID, field changed
# Verify logs exist (check in database or via audit-log API endpoint, TBD)

npm run test -- src/pages/hospital
npm run test -- src/lib/hospital-auth
npm run test -- src/pages/api/hospital/
```

### Security touchpoints

**MANDATORY security-auditor review:**
- Hospital credentials: stored securely (bcrypt ≥12 salt rounds), set during partner-registration (Phase 1), never hardcoded in code/git
- Hospital staff session: separate from patient/dev session, timeout (~30 min), rate-limit failed login attempts
- Data isolation: middleware enforces `WHERE hospital_id = [session.hospital_id]` on all queries; hospital A staff cannot access hospital B data (test this explicitly)
- File uploads (photos): validate type (whitelist: jpeg, png, webp), file size (max 5MB per image), store securely (S3 or server, storage TBD), serve with correct MIME types, no execution
- Audit logging: every change logged to Phase 1 audit_logs table (timestamp, staff ID, hospital ID, action type, field, new value); retention policy TBD (recommend ≥1 year for compliance)
- Destructive operations: require confirmation dialog (delete photo, delete announcement, remove doctor) before committing
- Input validation: all text fields validated and sanitized (no XSS, no SQL injection via Phase 1 parameterized queries)
- HTTPS only: secure cookie flag set for hospital staff session

---

## Phase 6: Testing, security audit, launch prep

**Duration:** 2–3 sprints  
**Dependencies:** All phases 0–5 complete  
**Parallelizable:** No (final gate, all parallel work merges here)

### Files to create/modify

- All test files: expand coverage (unit tests, integration tests, E2E tests)
- `.github/workflows/ci.yml` — extend CI pipeline: add code-coverage reporting, security scanning (npm audit, OWASP checks, SAST if available)
- `docs/SECURITY.md` — security audit findings + resolutions + checklist
- `docs/TESTING.md` — test strategy, coverage requirements, how to run tests locally and in CI
- `docs/DEPLOYMENT.md` — deployment checklist, secrets config, database migration steps, SSL setup, backups, monitoring, error reporting
- `.env.example` — finalize all env vars with descriptions
- `CHANGELOG.md` — v1 release notes (features, known limitations, disclaimers)
- `docs/COMPLIANCE.md` — post-launch compliance checklist (NDPC registration, data-protection agreement with clinics, legal review sign-off)
- `src/pages/terms-and-conditions.tsx` — Terms & Conditions page with first-aid disclaimer, data handling, user rights
- `src/pages/privacy-policy.tsx` — Privacy Policy page (data collection, usage, retention, user rights)

### Key tasks (parallel work by multiple agents)

**Test-runner:**
1. Increase test coverage for all critical paths to ≥80%:
   - Auth: signup (valid/invalid inputs), login (valid/invalid), logout, session expiry, IHN code generation
   - Biodata: GET/PATCH (with/without IHN code), field validation, audit logging
   - Hospital: registration (verified/community), CRUD via portal (with/without auth), data isolation (hospital A cannot see B)
   - First Aid: public read, developer upload/edit/delete, audit logging
   - Shared components: header rendering, footer links, form validation, theme application
2. Write integration tests: end-to-end user flows (signup → login → fill biodata → search hospitals → view first aid → logout)
3. Write E2E tests (if Playwright/Cypress): user journeys in real browser (optional for v1, but recommended)
4. Run full test suite in CI on every commit; fail CI if coverage drops below 80%

**Code-reviewer:**
5. Audit all code for performance: no N+1 queries, pagination on large result sets (hospitals, first-aid entries, suggestions), query indexes
6. Audit for unnecessary complexity: dead code removal, duplicate logic consolidation, simplification suggestions
7. Audit error handling: all errors produce actionable messages without leaking internals (no stack traces, no database errors exposed to client)
8. Audit logging: ensure all logging is structured (JSON), contains no PII/secrets, searchable

**Security-auditor:**
9. Comprehensive security review of all modules (mandatory):
   - **Auth:** password hashing (bcrypt ≥12 rounds), session/token security (cryptographically random, HTTP-only cookies), rate-limiting on login/biodata access
   - **Input validation:** all user inputs validated (email format, password strength, alphanumeric, length limits), SQL injection prevention (parameterized queries), XSS prevention (sanitization/escaping)
   - **Data access:** audit logging complete (every biodata read/write, every dev action logged), row-level security enforced (users see only own data, hospital staff see only own hospital, developers see only their entries/actions)
   - **API security:** CORS configured (no wildcard), HTTPS enforced (secure cookie flag), secure headers (CSP, X-Frame-Options, X-Content-Type-Options, Strict-Transport-Security)
   - **File uploads:** validation (type whitelist, size limit), storage security (outside web root, S3 or server with proper permissions), serving security (correct MIME types, no execution)
   - **Dependencies:** `npm audit` clean or triaged exceptions documented (explain why each vulnerability is acceptable or has a mitigation)
   - **Secrets:** no hardcoded credentials in code/git, all secrets in `.env.local` (dev) or GitHub Secrets / production secret store (prod)
   - **Database:** backups configured, migrations reversible, no unencrypted PII in plaintext (if needed, flag for encryption at rest)
   - **Compliance:** NDPC/NDPA compliance review with legal counsel (separate workstream, post-launch)

**Docs-writer:**
10. Write SECURITY.md: summary of audit findings, resolutions, and ongoing security practices
11. Write TESTING.md: test strategy (unit, integration, E2E), how to run tests, coverage goals, CI pipeline overview
12. Write DEPLOYMENT.md: step-by-step deployment checklist:
    - Database migration (run latest migration on prod)
    - Environment variables (set all in production secret store, verify none are missing)
    - SSL/HTTPS (generate/renew certificates, configure reverse proxy)
    - Backups (configure automated backups, test restore procedure)
    - Monitoring (set up error reporting, structured logging, health checks)
    - Secrets rotation (if applicable)
    - Rollback plan (if deployment fails, how to revert)
13. Update `.env.example`: document every env var with description and example value
14. Write CHANGELOG.md: v1 release notes (features shipped, known limitations, disclaimers, deprecations)
15. Write COMPLIANCE.md: post-launch checklist (NDPC registration, data-protection agreements, legal review sign-off, audit schedule)
16. Write Terms & Conditions page: include first-aid disclaimer, user data handling, IP/privacy, acceptable use, liability limitation
17. Write Privacy Policy page: data collection (what/why/how long), user rights (access/correction/deletion), cookie policy, NDPC/legal compliance

**Infrastructure & config:**
18. Set up production environment: all env vars in secret store (not in code/git), no plaintext secrets
19. Configure backups: automated daily/weekly backups, tested restore procedure
20. Enable HTTPS: SSL certificates (Let's Encrypt or equivalent), enforce HTTPS redirect
21. Configure logging: structured logs (JSON), no PII/secrets in logs, searchable, retention policy (suggest 90–180 days for logs, ≥1 year for audit_logs)
22. Set up error reporting: Sentry or equivalent (optional for v1, but recommended for production)
23. Set up health checks: `/health` endpoint for monitoring (returns 200 if all systems OK, includes basic checks: DB connectivity, disk space, etc.)
24. Prepare runbook: how to debug production issues, common failure scenarios, escalation procedure

**Verification & QA:**
25. Run full test suite: ensure all tests pass in CI
26. Run security audit: `npm audit`, SAST scan (if tool available), manual code review sign-off by security-auditor
27. Performance testing: simulate load (100+ concurrent users), check ETA calculation speed (OSRM), pagination efficiency (large result sets)
28. Accessibility audit: Lighthouse, axe, manual testing (semantic HTML, keyboard navigation, form labels, color contrast, screen reader compatibility)
29. Clinical/liability review: first-aid disclaimer wording reviewed by founder/legal counsel; verify no diagnosis claims, only "educational reference"
30. NDPC/NDPA compliance review: legal counsel reviews patient data handling, consent forms, deletion/erasure procedures (post-launch workstream if not done before launch)
31. Smoke tests: end-to-end manual tests (signup → login → biodata → search hospitals → view first aid → logout); all flows work correctly

### Verification commands

```bash
# Test coverage:
npm run test -- --coverage
# Should show ≥80% coverage for all critical modules (auth, biodata, hospitals, first-aid, dev)
# Output: coverage/index.html (open in browser to inspect gaps)

# Security audit:
npm audit
# Should be clean or have triaged exceptions documented in SECURITY.md

# Build for production:
npm run build
# Should complete with no errors or warnings

# Lint:
npm run lint
# Should be clean

# Type checking:
npm run type-check
# Should be clean (no TypeScript errors)

# Lighthouse audit (optional):
npm run build && npx lighthouse http://localhost:3000 --view
# Should pass: performance ≥90, accessibility ≥95, best practices ≥95, SEO ≥95

# E2E smoke tests (if Playwright/Cypress):
npm run test:e2e
# All flows pass: signup, login, biodata fill, hospital search, first-aid view, logout

# Production deployment checklist:
# - [ ] All env vars set in production secret store
# - [ ] Database migrated to latest schema
# - [ ] SSL certificates installed and valid
# - [ ] Backups configured and tested
# - [ ] Error reporting (Sentry) configured
# - [ ] Logging configured (no PII/secrets)
# - [ ] Health check endpoint working (/health → 200)
# - [ ] Security headers set (CSP, X-Frame-Options, HSTS, etc.)
# - [ ] CORS configured (no wildcard)
# - [ ] HTTPS enforced (redirect http → https)
# - [ ] Terms & Conditions and Privacy Policy pages live
# - [ ] First-aid disclaimer visible on first-aid pages and in T&Cs
```

### Security touchpoints

**This entire phase is security-auditor-driven:**
- No secrets in git, no PII in logs, all access logged, rate-limiting on sensitive endpoints, secure headers set, HTTPS enforced, backups configured
- Verify compliance: data protection agreement with clinics (pending legal review), consent forms (if needed), deletion/erasure procedures
- Sign-off: security-auditor must sign off on all findings + resolutions before launch

### Open items (post-launch)

- NDPC registration + data-protection compliance (legal workstream, can start before launch but doesn't block it)
- Image storage (S3, self-hosted, or other) — defer until server/infrastructure is ready
- Performance optimization if OSRM rate-limiting becomes a bottleneck (self-hosting OSRM)
- Telemedicine, queue management, appointment booking (all deferred to Phase 2+)

---

## Parallelizable Sprints (recommended schedule)

- **Sprint 1:** Phase 0 (scaffold, CI/CD, local setup) — 1 builder
- **Sprint 2:** Phase 1 (backend: auth, data models, APIs) — 1–2 builders (schema first, then parallel: hospital/biodata/first-aid modules)
- **Sprints 3–4:** Phase 2 shared components + Phase 1 completion in parallel — 1 builder on components, 1 builder on Phase 1 APIs
- **Sprints 5–7:**
  - **Phase 2:** Homepage + Hospital Profile + Filter page in parallel (3 builders, once shared components done)
  - **Phase 3:** Dashboard in parallel (1 builder)
  - **Phase 4 public:** First-aid public catalog in parallel (1 builder)
- **Sprints 8–9:**
  - **Phase 4 dev:** Developer section (1 builder)
  - **Phase 5:** Hospital management portal (1 builder)
- **Sprints 10–12:** Phase 6 (testing, security audit, launch prep) — all team members converge

Total estimated duration: **10–12 weeks** for a typical team of 2–3 builders + 1 QA/test runner + security-auditor (can overlap with other projects if part-time).

---

## Key decisions locked in for v1

1. **Symptom search:** Stubbed in Phase 2 (part of 3-mode search bar on homepage); will be joined with First Aid triage in future phases, not v1
2. **IHN code:** Static, never rotates; shareable with close relatives/friends for emergency access; explained on biodata form with disclaimer
3. **Hospital data tiers:** Verified (institution account, self-managed) + Community-managed (dev-seeded, crowdsourced via suggestions); distinction flagged on hospital-profile page
4. **Suggestions workflow:** Simple & informational (suggestions dashboard in dev portal, devs manually review + apply to community-managed hospitals; not automated)
5. **Storage:** Deferred (images uploaded to local filesystem for dev; S3/server integration TBD when infrastructure ready)
6. **First-aid disclaimer:** "This is educational reference only and should not replace professional medical advice. Always consult a qualified healthcare provider. This guidance is not provided under law." (added to T&Cs, displayed on first-aid pages)
7. **Hospital management portal:** Included in Phase 5 (for verified hospitals to self-edit listings)
8. **Developer pages:** Disconnected from main site (not linked from header/footer/homepage); only accessible via direct URL or primary-dev-page hub
9. **Legal/compliance:** NDPC/NDPA review deferred to post-launch workstream (parallel to operations, not blocking v1 launch)

---

## Notes for builders

1. **Read the page specs first:** Every phase references one or more files in `docs/pages/`. Read the corresponding spec before implementing. Specs are the single source of truth for page layout, fields, and functionality.
2. **Theme consistency:** Matte blue/white/amethyst with no gradients into white and no colored text on white is site-wide. Use CSS variables (`--color-blue`, `--color-amethyst`, etc.) to enforce consistency.
3. **Security is not optional:** Every phase with "MANDATORY security-auditor review" must not proceed to the next phase until security-auditor approves. Don't skip it.
4. **Env vars & secrets:** All secrets (database URL, API keys, session secret, developer credentials) go in `.env.local` (dev) or production secret store (prod). Never hardcode them.
5. **Error handling:** All API endpoints must return structured error responses (e.g., `{ error: "Email already exists", code: "EMAIL_EXISTS", status: 409 }`) and log errors server-side without exposing internals.
6. **Testing expectations:** Each phase should have ≥70% test coverage locally; Phase 6 gates launch on ≥80% overall coverage. Tests should cover happy path + critical failure scenarios.
7. **Suggestions feature:** Use the suggestions tab (on every page) to crowdsource improvements for community-managed hospitals and general product feedback. Devs review + apply manually.
8. **Handoff to next phase:** Before a phase is marked complete, ensure all tasks are done, tests pass, and the next phase's dependencies are met. Use the verification commands to confirm.

---

## Success criteria for launch

- ✅ All tests pass (≥80% coverage)
- ✅ Security audit complete, no critical/high findings (low findings documented + mitigation plan)
- ✅ Performance: ETA calculation <500ms, hospital search <1s, no N+1 queries
- ✅ Accessibility: Lighthouse scores ≥95 (performance ≥90, accessibility ≥95, best practices ≥95, SEO ≥95)
- ✅ All deployments documented (DEPLOYMENT.md + runbook)
- ✅ Terms & Conditions + Privacy Policy live with first-aid disclaimer
- ✅ Smoke tests pass (end-to-end user flows working)
- ✅ Backup/restore procedure tested
- ✅ Error reporting configured (Sentry or equivalent)
- ✅ Health check endpoint working
- ✅ HTTPS enforced, secure headers set
- ✅ No hardcoded secrets in code/git
- ✅ Founder/legal counsel approves first-aid disclaimer and data handling
