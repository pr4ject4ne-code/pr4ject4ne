# First Aid page — Racoon Eye v1

Status: **fully discussed and confirmed** (2026-07-05).

Reached via the hamburger menu's "First Aid" item on the homepage ([homepage.md](homepage.md)).

## Purpose & visibility

A **read-only, developer-managed catalog** of first aid and safety scenario procedures. Public-facing users can browse and read, but cannot edit. All updates/uploads are restricted to developers only. This is a static reference resource, not an interactive triage engine (unlike the symptom-search mode on the homepage, which may be separate — that relationship is still open/TBD).

## Public-facing design (read-only catalog)

- Layout and visual styling left to builder's discretion within site-wide theme rules: matte blue/white/amethyst, sans-serif fonts throughout, no gradients into white, no colored text directly on white.
- Top bar and footer are the standard shared components from [homepage.md](homepage.md).
- Content: organized catalog of first aid procedures, safety scenarios, etc. (exact grouping/categorization left to builder and founder refinement).
- **Suggestion tab** (on this page and every page): a small affordance (icon, button, or link) to submit suggestions, feedback, or corrections. Submissions go to the site's designated support email (currently TBD — see open items).
- No clinical disclaimers on this page itself (it's a reference catalog, not triage guidance), but security-auditor should flag if any liability language is needed.

## Developer section (disconnected from main site)

- **Access:** secure developer login (separate from patient/user login and from main site navigation). Developer pages are **not directly linked** from the main site — they are only accessible via a primary developer management page (see primary-dev-page.md).
- **Rights & scope:** authenticated developers can upload, edit, and manage the first aid catalog.
- **Upload form fields:**
  - Picture upload (one or more images per entry)
  - Definition (concise definition of the condition/scenario)
  - Description (detailed explanation)
  - Process (step-by-step procedure or technique)
  - Do's and Don'ts (bulleted do's and don'ts)
  - Things to look out for (warning signs, complications, etc.)
  - Implications (consequences if not treated, potential outcomes)
  - Indication (when this procedure/technique is appropriate)
  - Contraindications (when this procedure/technique should NOT be used)
- **Content categories:** entries are split into two types:
  - **Procedures** (medical/first-aid procedures)
  - **Techniques** (methods, approaches, or specialized techniques)
- **Security requirements:**
  - Developer credentials must be stored securely (hashed passwords, no plaintext storage).
  - All developer actions (uploads, edits, deletions) must be logged with timestamp, developer ID, change type, and description (audit trail for compliance/review).
  - Developer session management: timeouts, rate-limiting on login attempts to prevent brute force.
  - Security-auditor must review before build: this is sensitive access that bypasses the read-only public view.
- **Login credentials & management:** Handled via the primary developer management page (primary-dev-page.md) — credentials are generated there and do not appear in code/git (use env vars or secure credential manager).

## Open items / not yet decided

- Site's support/feedback email address: what email should the "suggestion tab" send to? (Currently it's unclear — confirm a dedicated support email, or use pr4ject4ne@gmail.com if that's preferred.)
- Exact catalog structure: how should procedures be grouped/categorized (by injury type, body part, severity, scenario, etc.)?
- Developer login delivery mechanism: how and where will developer credentials be safely shared with authorized developers once infrastructure is ready?
- Whether this first-aid catalog page is truly separate from the homepage's symptom-search mode (if that exists), or if they feed the same data source — to be clarified with the homepage design.
- Liability/clinical disclaimer language specific to a reference catalog (vs. the not-a-diagnosis rule that applies to triage guidance).
