# Hospital Profile page — Racoon Eye v1

Status: **fully discussed and confirmed** (2026-07-05).

Reached by clicking on a hospital mini-profile card from the homepage ([homepage.md](homepage.md)).

## Top bar (modified for hospital context)

- Same structure and theme as [homepage.md](homepage.md), but with one addition:
  - **Hospital logo** displayed beside the Raccoon Eye brand logo (left side of the bar). Hospital chooses/uploads this logo as part of their self-registration profile (SPEC.md module 1).
- Search bar in this context is **hospital-specific**: searches only within this hospital's information, services, and announcements — not a global search.
- Hamburger menu remains the same (Profile/login + First Aid link).

## Main content

### 1. Media gallery
Five photographs:
- Outside (far view/building frontage)
- Outside (close-up/entrance)
- Inside reception
- Two additional images (gallery, interior, facilities, etc. — exact content left to hospital's discretion)

### 2. Hospital information
- Name
- Address
- Hospital website (clickable link)
- Contact information (phone, email, or both)

### 3. Times of service and visit
- Operating hours / service availability (exact format TBD — could be per-department, per-day, or overall).

### 4. Dynamic calendar with announcements
- **Calendar display:** shows dates with associated announcements/events.
- **Color coding** by severity/urgency:
  - **Green:** light (minor announcements, routine updates)
  - **Yellow:** intermediate (moderate importance, scheduling changes, etc.)
  - **Red:** urgent (critical announcements, closures, emergencies, significant updates)
- **Announcement bar** positioned above the calendar: displays the most recent or highest-priority announcement prominently.
- Clicking a date on the calendar shows its associated announcement(s).

### 5. Personnel dropdown
- **Doctors roster:** expandable dropdown listing all doctors at the hospital.
- **Per-doctor display:**
  - Name
  - Speciality/specialty
  - Level (e.g., consultant, resident, intern — exact titles TBD)
  - **Rating:** patients can rate doctors; display aggregate rating.
- Expand/collapse to show or hide the full roster.

### Footer
Standard shared footer component from [homepage.md](homepage.md).

## Hospital data management

- Hospital self-manages all the above information (pictures, hours, announcements, doctor roster, ratings) via their institution account dashboard (separate from patient dashboard, not yet specced).
- Information is **publicly readable** (anyone can view hospital profile), but **editable only by that hospital's account holders** via their institution portal.

## Open items / not yet decided

- Doctor rating mechanism: is it a simple star-rating (1–5), or more detailed feedback? Who can rate (any patient, verified-visit-only, etc.)? How are ratings displayed (average, with review count)?
- Announcement color-coding rules: who decides the color (hospital, system rules, or automatic based on keywords/keywords)? Can a hospital override?
- Calendar granularity: does it show every day, or only days with announcements? Clickability?
- Exact format for "times of service and visit" — combined, or separate lines for service hours vs. visit/consultation hours?
- Doctor "level" taxonomy — what are the valid levels and who defines them (hospital self-entry, standardized list, or verified credentials)?
