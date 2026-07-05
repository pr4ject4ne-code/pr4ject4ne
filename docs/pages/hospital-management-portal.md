# Hospital Management Portal — Racoon Eye v1

Status: **fully discussed and confirmed** (2026-07-05).

A dedicated backend portal (separate from the main patient-facing site) where hospital/organization account holders can manage their institution's listings, media, announcements, and personnel.

**Disconnection from main site:** Like the primary developer page, this portal should not be directly linked from the homepage or public site. Hospital staff access it via a dedicated login (separate from patient login) and a separate URL or entry point (exact mechanism TBD).

## Access

- **Login:** email + password (institution account credentials, set up during SPEC.md module 1 partner-registration flow).
- **Authorization:** only hospital account holders / authorized staff of that institution can access their own portal; strict data isolation (hospital A cannot see hospital B's data).

## Content management sections

### 1. Media gallery ([hospital-profile.md](hospital-profile.md) pictures)
- Upload/replace the five required photos:
  - Outside (far view)
  - Outside (close-up)
  - Inside reception
  - Two additional images (gallery)
- Organize, crop, caption, or delete images.

### 2. Hospital information ([hospital-profile.md](hospital-profile.md) basic info)
- Edit hospital name
- Edit address
- Edit/add hospital website URL
- Edit/add contact information (phone, email, etc.)

### 3. Times of service and visit
- Set or update operating hours / service availability (exact format left to builder, but should support per-department or overall hours).

### 4. Calendar & announcements
- Add/edit/delete announcements (tied to specific dates or ongoing).
- Assign color codes to announcements:
  - Green (light)
  - Yellow (intermediate)
  - Red (urgent)
- Manage the announcement bar (display the most recent or highest-priority announcement).

### 5. Personnel management ([hospital-profile.md](hospital-profile.md) doctors)
- Add/edit/remove doctors from the roster.
- For each doctor: set name, speciality, level (consultant, resident, intern, etc.).
- View aggregated patient ratings for each doctor (read-only from this portal; patients rate via the public hospital-profile page).

## Security & audit

- **Data isolation:** hospital staff can only view/edit their own institution's data.
- **Audit logging:** all edits (upload, change, delete) are logged with timestamp, staff member ID, and change description.
- **Session management:** timeouts, rate-limiting on failed logins.
- **Security-auditor:** must review before deployment — institution accounts are semi-trusted (they manage public-facing data) but still need safeguards against accidental data loss or malicious edits.

## Open items / not yet decided

- Institutional staff role/permission model (can all staff do all edits, or are there role-based restrictions like "can edit media but not delete"?).
- Bulk edit/import tools (if hospitals want to import doctor rosters in bulk, for example)?
- Notification mechanism (does the hospital get notified when a new rating is posted, or an announcement is about to expire?).
