# Dashboard — Racoon Eye v1

Status: **partially discussed and confirmed** (2026-07-05) — main dashboard layout + Profile section fully specced below. Other dashboard sections not yet discussed.

Reached after successful login via the hamburger menu's "Profile" item on the homepage ([homepage.md](homepage.md)) — see [login.md](login.md) for the entry flow.

**Top bar and footer are the same components as the homepage** ([homepage.md](homepage.md)) and must stay consistent across every page in the app, not just the dashboard. All homepage theme rules (matte blue/white/amethyst, no gradients into white, no blue/purple text on white) apply here too.

## Main dashboard (first section / landing view)

For now, a simple layout:
- **Left:** "Recent" — recent activity (exact content/feed TBD at build time; keep it simple for v1).
- **Calendar:** expandable, opens as an on-page overlay (not a navigation to a new page). For v1 it behaves like an ordinary calendar (no custom booking/queue logic yet — that's later-phase scope per SPEC.md's deferred clinic-workflow module).

## Profile section (second section of the dashboard)

This is the **Biodata Farm** — per the founder, one of the key trust/value drivers of the whole product: "the greatest source of trust for immediate healthcare measures and insight into health choices." The data model here must be precise and reliable; visual layout is left to planner/builder discretion within the site-wide theme rules, but the fields and access rules below are exact and not to be altered without founder sign-off.

### Access code

- Every account holder has a **changeable code prefixed `IHN-`** (rest of the code TBD/generated, but the account holder chooses/sets it).
- Purpose: used, saved, or shared by the account holder to access their info at any time — this is the account holder's own retrieval/sharing mechanism for their biodata, not a doctor/admin backdoor.
- Because it's changeable and shareable, treat it like a credential: security-auditor should review how it's generated, rotated, rate-limited, and logged when this section is built (ties into SPEC.md's "every access logged" rule).

### Two layers

#### 1. Profile layer — freely available

- **Compulsory:**
  - Full name (with optional alias field underneath, if the person goes by something else)
  - Gender
  - Contact info: phone and email
  - Date of birth (may be hidden from public/other viewers per the account holder's preferences — the field itself is still compulsory to provide, only its visibility is optional)
  - Next of kin contact
- **Not compulsory:**
  - Address

#### 2. Biodata layer — locked behind security (the `IHN-` code)

- **Patient-filled:**
  - Chronic disease
  - Occupation
  - Marital status
  - Religious status
  - **Anthropometric measurements:**
    - Height (cm)
    - Weight (kg)
    - Waist circumference (cm)
    - Chest circumference (cm)
    - Hip circumference (cm)
    - BMI (calculated automatically from height and weight, display-only)
- **Recommended to source from official documents/reports (not required at signup):**
  - Genotype
  - Blood group
  - Clinical condition — with timestamp; presented as selectable options plus free-text space to write the cause
  - Disability
  - Known health preferences

For v1, anyone (patient, family member, or later a doctor) can enter these fields if they have reliable/official source documents (lab reports, medical records, etc.). The "recommended" designation means these are most valuable when sourced from authoritative records rather than guesswork. Per SPEC.md, clinical fields remain **unverified** until a doctor-verification mechanism exists in a later phase — for now, the patient/account-holder is responsible for accuracy if they're filling them in manually.

## Open items / not yet decided

- What else lives in "Recent" on the main dashboard (recent searches? recent hospital visits? not specified).
- Full generation/format rules for the `IHN-` code (length, charset, uniqueness, rotation policy).
- Whether/how a doctor account actually writes to the doctor-filled biodata fields in v1, given doctor accounts aren't otherwise specified yet.
- Hospital/institution-side dashboard (distinct from this patient dashboard) — not yet discussed.
