# Hospital management portal

Covers `/hospital/login` and `/hospital/dashboard` — where verified hospital staff
manage their own institution's public listing. Read [README.md](README.md) first.
Design spec: [`docs/pages/hospital-management-portal.md`](../pages/hospital-management-portal.md).

## Model

- Hospital-staff accounts (level-3 **tertiary**) live in `users` with
  `account_type = 'hospital_staff'` and a non-null `hospital_id`. There is **no
  self-service signup** — a developer provisions them via `POST /api/dev/tertiary`
  (see [developer-portal.md](developer-portal.md#1b-tertiary-provisioning--apidevtertiary-any-developer)).
  They sign in at the unified `/login` and land on `/hospital/dashboard`.
- **Strict data isolation:** a staff member can only read/write their own
  `hospital_id`. This is the portal's core security property.
- The portal renders in `HospitalShell` (`src/app/hospital/HospitalShell.tsx`), a
  self-contained chrome with no links into the public site.

## The isolation choke point

Every write endpoint calls `requireHospitalOwnership(hospitalId)`
(`src/lib/hospital-auth.ts`), which returns the staff context only when the
session's `hospital_id` equals the path `id`, else `null` → `403`. Child resources
(announcements, doctors) are additionally scoped by `... WHERE id = $1 AND
hospital_id = $2`, so even a valid announcement/doctor id from another hospital
can't be edited or deleted. There is no code path where hospital A touches
hospital B's data.

## Login — `POST /api/hospital/login`

Body `{ email, password }`. Rate-limited `hospital_login:<email>` → 5 / 5 min.
Rejects non-`hospital_staff` accounts, inactive accounts, and staff with no
`hospital_id`, before the password check. On success sets
`racoon_hospital_session` and returns `{ hospital_id }`; emits `login`.
Session: `GET /api/hospital/session`. Logout: `POST /api/hospital/logout`.

## Management endpoints (all own-hospital only)

All routes are under `/api/hospital/[id]/…` and require ownership of `[id]`.

| Method | Route | Purpose |
| --- | --- | --- |
| `PATCH` | `.../info` | Edit name, address, city, website, contact phone/email, specialties (≤50), `is_24_hour`. Partial update. |
| `PATCH` | `.../hours` | Set operating hours. Body `{ hours: { mon..sun: string } }`; only known day keys with ≤100-char values are kept. |
| `PUT` | `.../media` | Replace the photo set (≤5) and optionally the logo. Each URL passes `safeHttpUrl`; slots: `outside_far`, `outside_close`, `reception`, `other`. |
| `POST`/`PATCH`/`DELETE` | `.../announcements` | Create/edit/delete announcements. Color `green|yellow|red`; `is_bar` flag marks the one bar announcement (setting a new bar clears the old one inside a transaction). DELETE takes `?announcement_id=`. |
| `POST`/`PATCH`/`DELETE` | `.../personnel` | Manage the doctor roster: name, specialty, level (`consultant`, `senior_registrar`, `registrar`, `intern`, `other`). DELETE takes `?doctor_id=`. Doctor **ratings are read-only here** — patients rate on the public profile; staff can never set them. |

Text fields are sanitized (`sanitizeText`); URLs go through `safeHttpUrl`. Every
mutation writes an audit row (`hospital_update`, `announcement_change`, or
`personnel_change`) with the staff `user_id` and the affected fields/operation.

## Verified vs community-managed listings

The portal only edits **verified** listings (those with an institution account
linked via `account_id`). **Community-managed** listings (dev-seeded, `account_id`
NULL) have no staff account — they're improved through the suggestions workflow in
the [developer portal](developer-portal.md#3-suggestions--apidevsuggestions), not
here. The public hospital-profile page flags which kind a listing is.

## Security notes

- Ownership is re-checked server-side on **every** request; the UI never decides
  access.
- All UUIDs (path + body ids) are validated before the DB call.
- Institution accounts are *semi-trusted*: they manage public-facing data, so the
  safeguards focus on isolation, input sanitization, and a complete audit trail
  rather than on withholding capability.
- `security-auditor` must review before production deploy (per the design spec).

### Known gaps / not in v1

- No intra-hospital role model — any staff account for a hospital can do every edit
  (no "media but not delete" granularity).
- No bulk import (e.g. doctor rosters).
- No notifications (new rating posted, announcement expiring).
- Image upload storage deferred: endpoints accept URLs; add file type/size
  validation when real storage is wired.
