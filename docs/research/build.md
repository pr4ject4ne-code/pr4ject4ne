# Summary: BUILD_260519_215455.pdf (17 pages, screenshots of founder notes)

## Purpose
Founder's build spec for "AWANG" — described verbatim as "the world's first IHN (Integrated Hospital Network)". It is a page-by-page UI/functional spec for the public web platform: primary domain (landing/login/dashboard/profile/settings) plus per-hospital subdomains. Written as layout prose (HEAD/SECTION/FOOTER per page), not as a technical architecture doc.

## Architecture / stack / integrations (as stated)
- **Domain structure**: a primary domain (landing page + privacy policy, terms & conditions, about, contact us, "become a partner" page) and **subdomains** — "Every institution or private practice has a subdomain page under its management separate from others, think of it like how YouTube creators have their own page."
- **One IHN account for everything**: "one 1 IHN account is all you need to access any hospital under IHN". Login with IHN credentials goes to a private dashboard "not attached to the service provider (hospital)"; accounts registered as staff under an institution, or with an approved IHN private practice, can **switch to the professional dashboard** for that institution.
- **Content wizard**: the technical team must be able to upload/remove landing-page "plates" (text, images or both) and partner logos "through a wizard" (an internal technical/admin page).
- **AI integration** (only one named): in "Book an appointment", the patient "can type their problem and use an AI to allocate or link it to the desired department."
- No languages, frameworks, databases, hosting, or third-party APIs are named anywhere in this doc. Only implementation hints: CSS-ish units ("<5vh", "50%vw → 80%vw/20%vw on click"), "use svg's for icons and you can leave the links hashed" (footer social links), image "base authentication" by the system for uploaded profile photos.

## Pages / modules specified

### 1. Landing page (primary domain)
- HEAD: brand left; links to about, support, login on right; between them a **search bar that searches hospitals, staff and procedures**, expanding results in a "mini on-page window".
- SECTION I: background horizontal scroll of benefits: (i) Convenient Appointment, (ii) saving time/stress, (iii) control over your health services, (iv) a brand you can trust with all you need in one place. Plates editable via wizard.
- SECTION II: "Get started" button → login page, or "Dashboard" if already logged in. Background: horizontal infinite scroll of partners (wizard-updatable). Beside it a "become a partner" element.
- FOOTER: brand (AWANG), social links beside, copyright under.

### 2. Login / Get started
- Toggle button (peg) between login and get started. HEAD: brand top-left, back button right.
- LOGIN body: Email + Password only.
- GET STARTED (signup) body:
  a. full biodata: Name, Age, Sex, Occupation, Marital Status, Address, Religion.
  b. Biometrics (optional but recommended): weight, height, blood group, genotype — "requires doctor to upload or an authentic report".
  c. Hospital affiliation and Hospital number if known ("required for proper setup").
  d. Email and password creation.
- After signup a dashboard is created but "awaiting approval"; the system should "base authenticate the image" (profile photo).

### 3. Dashboard (every account has one; integrates the entire platform)
- HEAD: brand top-left; back button, profile, settings, logout.
- SECTION I (short, <5vh, absolute/pinned): **queue bar** — indicates next appointment, warns when an appointment is due (e.g. "doctor says come back in two weeks", warning from 2wk away), shows queue number and expected waiting time; periodically shows public announcements of hospitals the person is affiliated with (limited time, "1 loops an hour 4 times"), expanding shows full announcements.
- SECTION II: search bar — "search anything that's public or private to the account".
- SECTION III: **private calendar, 3 layers**: (a) normal calendar; (b) doctor's indications (visits, medication duration) via expandable tags and highlighted dates; (c) personally marked dates (all expandable).
- SECTION IV: split. Left = Recent (all recent timelines: purpose, date, tasks; expandable). Right = Documents — page of all uploaded documents with hospital, date, reason for visit ("only applies to information patients can have").
- SECTION V: **special upload** — user-exclusive document/image upload; deletion only allowed 48hrs after upload; private until shared.
- FOOTER: same as landing.

### 4. Profile — the Biodata "FARM"
- Called "one of the KEYs to our success… greatest source of trust for immediate healthcare measures and insight into health choices." Located in profile tab, 2 layers:
  - **PROFILE (freely available)**: compulsory — full name (+ optional alias), gender, contact info (phone + email), date of birth (hideable by preference), a photo (must be actual account holder), national identification (or licence/passport), race. Not compulsory — address, next of kin with contact.
  - **BIODATA (locked behind security)**: PATIENT FILL — chronic disease, height, weight, occupation, marital status, religious status. DOCTOR FILL — genotype, blood group, clinical condition (with timestamp, options with space to write cause), disability, known health preferences. (Page 8 gives a doctor-fill list that also includes chronic disease/height/weight/occupation/marital/religious status; page 15's restatement splits patient-fill vs doctor-fill as above — the doc restates itself with slight drift.) Patient-editable fields have an edit button; "a new edit requires a doctor's approval with timestamps."

### 5. Settings
- Hiding profile info (if allowed); censoring hospitals or reducing scope to certain locations; change profile info; delete account ("clears all access and publicity but the system retains all data"); Copy (including personal); Report and id.

### 6. SECURITY KEYS (data-sharing mechanism)
- Keys "change frequently (every 24hrs)" and are logged when triggered: account used on, time, information accessed.
- **12-alphanumeric key**, only shown when triggered on the account to be accessed (requires password or biometric). Key comes FROM the account being accessed and is used on another account.
- Scope options: a specific record or collection (select and share); biodata or entire profile base; history log or consultation log; images or personal uploads.
- "This key is essential for ALL data transfers", by individuals and institutions; abuse carries penalties (must be addressed in terms and guidelines).
- Hospital-specific files held by the patient cannot be read by the patient but can be transferred; personal use leads to legal action. Hospitals strictly prohibited from using data for interests not directly benefiting patients (incl. financial); they are directed to "the analysis board" for needed information. Penalties for exposing patient-sensitive data without consent.

### 7. Subdomain (hospital home page, "patient view also primary view")
- Announcements strip above header (only if applicable).
- HEAD: brand (AWANG) left in white; the institution's selected logo right; navbar in middle; **queue bar** indicating position and estimated time if on appointment or schedule — timed against every patient who fulfilled a consultation/appointment, with accommodation for missed schedules, "to give people in the queue the most accurate time possible".
- SECTION I: background auto-rotation of uploaded gallery with central "Book an appointment" button.
- SECTION II: 2 columns, both 50%vw, expanding on click to 80%/20%: left = staff list (each member's details; clicked member expands to show speciality and available days; vertical scroll on overflow); right = calendar (open/close days, times, notes).
- SECTION 3: login option (one IHN account for all hospitals; staff/private-practice accounts can switch to professional dashboard).
- FOOTER (ordered rows): hospital's socials and contact info first; beneath it the brand (AWANG) and copyright.

### 8. "Book an appointment" flow
- Two ways: (1) patient types their problem, AI allocates/links to the desired department; (2) patient scrolls through visible departments offered. Then shown available time/date and the attending doctor; if a specific doctor is selected, that doctor is informed of the appointment and all allotted info (biodata and symptoms). First-time visits requiring opening a file must be indicated along with the price.

### 9. Dashboard: Patient view (main page, triple-layer structure with solid bar intermediates)
- I. Nav bar (all windows accessible): brand name with account name under (left); Profile, Settings (right).
- II. Progress bar: dropdown to 2 majors — (1) appointment list; (2) doctor/pinned info incl. medication (with dates), meetings, or indication to set appointment.
- III. Visit History: dropdown expands last month; a key extends to all time.
- "SEE REST IN SUBDOMAIN ABOVE" (rest of layout identical to subdomain spec).

## Decisions made vs. open
- Decided: brand "AWANG"; IHN concept; primary domain + per-institution subdomains; single-account model with patient/professional dashboard switch; biodata two-layer model with patient-fill vs doctor-fill and doctor-approved edits; 24hr-rotating logged 12-char security keys gating all data transfers; queue bar; 48hr-locked special uploads; delete-account retains data internally; AI department allocation in booking.
- Open/unspecified: entire technology stack, hosting, database, auth implementation, what "base authenticate the image" means concretely, pricing/payments (price display mentioned once), how AI is provided, approval workflow details for new accounts.

## Contradictions with BUILD-PUBLIC
- (Full list in build-public.md.) BUILD-PUBLIC is the same spec formalized as an "AWANG IHN Complete Structural Architecture Document" — no tech stack in either doc. Direct conflict: this doc's special upload "only allows deletion 48hrs AFTER upload" (48h lock) vs BUILD-PUBLIC's "deletion is only permitted within 48 hours after upload" (48h window). This doc's "1 loops an hour 4 times" announcement frequency is dropped to "loop periodically" in BUILD-PUBLIC. This doc's page-8 doctor-fill list vs page-15 patient/doctor split is an internal inconsistency repeated in BUILD-PUBLIC (its p40 vs p66-67); the split version (doctor fills genotype, blood group, clinical condition, disability, health preferences) appears intended.
