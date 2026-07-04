# Summary: BUILD- PUBLIC_260519_220430.pdf (77 pages)

## Purpose
"AWANG — Integrated Hospital Network (IHN) — Complete Structural Architecture Document." This is the cleaned-up, formalized rewrite of BUILD_260519_215455.pdf: same platform, same sections, restructured as a requirements/architecture document (definition → primary domain → each system → subdomain → cross-cutting rules → infrastructure requirements). It is the more authoritative statement of intent; content is structural/behavioral requirements, not implementation tech.

## Platform definition (verbatim intent)
- "AWANG is designed as the world's first fully integrated healthcare network built around a **persistent patient identity** rather than isolated institution-based records."
- The system functions as: an Integrated Hospital Network (IHN); a federated healthcare infrastructure; a cross-institution healthcare coordination platform; a unified patient identity ecosystem; a healthcare interoperability layer; a real-time operational healthcare management system; a secure medical data exchange platform.
- Architecture goals: one patient identity interacts with multiple institutions; institutions remain independently managed under shared infrastructure; healthcare continuity across hospitals/clinics/specialists/private practices; patient information permission-controlled and security-logged at all times. "The system is fundamentally patient-centered, not institution-centered."
- Closing "defining architectural characteristic": "A persistent patient identity operating across independently managed healthcare institutions under a unified interoperability and operational infrastructure."

## Primary domain (DOMAIN: AWANG)
Acts as: public ecosystem gateway, identity authority, onboarding system, interoperability authority, central healthcare coordination layer, institution discovery platform.
Contains: Landing Page, Login System, Registration/Get Started System, Global Patient Dashboard, Profile System, Settings System, Legal Pages, Partner Registration.

### Landing page
- Serves as public face, trust-building interface, patient entry point, institution discovery system, healthcare search interface. Links: Privacy Policy, Terms and Conditions, About, Contact Us, Become a Partner.
- HEAD (3 sections): Left = AWANG brand/logo (identity marker, home anchor). Center = global search bar searching hospitals, staff, specialists, departments, procedures; results expand in a mini on-page window without leaving the page, showing institution details, staff details, procedure info, department affiliation, related services, availability previews; must support real-time filtering, dynamic suggestions, fast response rendering. Right = navigation links: About, Support, Login.
- SECTION I — Benefits display: horizontal background scroll, infinite/continuous motion, showing AWANG ecosystem benefit "plates" (text, images, or both). Example themes: convenient appointment booking, reduced stress, time-saving coordination, greater patient control, unified services, trusted management. **Admin requirement**: technical/admin team can upload/remove/reorder plates, schedule visibility, configure scrolling behavior "through an internal management wizard. No plate content should require hardcoded frontend modification."
- SECTION II — Action section ("primary conversion layer"): "Get Started" button; logged out → displays "Get Started" → authentication/registration; logged in → displays "Dashboard" → straight to dashboard. Background system: infinite horizontal scroll of dynamic partner display (hospitals, clinics, specialists, private practices, affiliated institutions), easily editable/dynamically manageable/uploadable via admin wizard. Secondary action: "Become a Partner" (institution onboarding, network expansion, private practice registration).
- FOOTER: AWANG branding, social links, copyright. Social icons: use SVGs, support linked routing, allow hashed placeholders during development.

### Login / Get Started system
Acts as identity onboarding layer, authentication layer, patient creation system. A peg/tab/button switches Login ↔ Get Started. HEAD: AWANG brand top-left, back button right.
- LOGIN body: email field + password field. "Simple authentication structure."
- GET STARTED ("creates the user's IHN identity"):
  A. Personal biodata (required): Name, Age, Sex, Occupation, Marital Status, Address, Religion — "the initial patient profile foundation".
  B. Biometric/clinical baseline (optional but strongly recommended): Weight, Height, Blood Group, Genotype. **Verification rule**: blood group and genotype "require doctor upload OR authentic medical report upload. This information cannot rely solely on patient self-entry."
  C. Hospital affiliation (required fields): hospital affiliation, hospital number (if known) — for existing patient matching, institutional linkage, faster onboarding, continuity setup.
  D. Account credential creation: email + password.
- After registration: dashboard created automatically; account enters **pending approval** status.
- Image authentication requirement: system should perform identity validation on the profile photo — facial authenticity checks, image verification, fraud prevention, anti-impersonation validation.

### Global Patient Dashboard
Serves as central operational interface, healthcare continuity hub, appointment coordination center, patient management system, cross-institution operational layer. "Integrates the entire platform and prioritizes essential healthcare information."
- I. HEAD: brand name/logo, back button, Profile, Settings, Logout.
- II. SECTION I — Queue bar: short (<5vh), absolute/fixed, never leaves frame, constantly visible. Displays next appointment, queue number, estimated waiting time, follow-up reminders, appointment warnings, return-visit indications (e.g. "Doctor instructed revisit in 2 weeks"). Hospital announcement system: queue bar periodically displays public hospital announcements, institution notices, operational updates — limited to institutions the patient is affiliated with; announcements loop periodically, display temporarily, expand on interaction to full details.
- III. SECTION II — Global search bar: universal search over public information, private patient records, appointments, documents, hospital information, staff, procedures, uploaded files.
- IV. SECTION III — Private calendar system, three integrated layers: Layer A standard calendar; Layer B doctor indication layer (visits, medication duration, follow-up schedules, clinical reminders; display via expandable tags, highlighted dates, dynamic indicators); Layer C personal calendar layer (personally marked dates, private reminders, personal notes; all entries expandable).
- V. SECTION IV — Recents & Documents, two panels. Left panel Recent History: recent timelines, visit purposes, dates, tasks, follow-up activities; entries expandable with detailed viewing. Right panel Documents: opens a dedicated page containing uploaded documents, consultation records, institution-generated files; each document displays hospital/institution, date, reason for visit; access limitation — applies only to information patients are permitted to possess/access.
- VI. SECTION V — Private upload system: patient-controlled uploads (images, documents, personal medical uploads). Access rules: private by default, invisible unless shared. **Deletion rule: "Deletion is only permitted: within 48 hours after upload."**
- VII. FOOTER: same as landing page.

### Profile system — the "Biodata Farm"
"One of the core trust layers of the ecosystem." Acts as healthcare trust engine, continuity-of-care foundation, rapid healthcare insight system, source of emergency healthcare guidance. Located in the Profile tab. Two layers:
- I. PROFILE LAYER (freely available): Compulsory — full name, alias (if applicable), gender, phone number, email, date of birth, profile photo, national identification, driver's license or passport (where applicable), race. Optional — address, next of kin, next of kin contact. Profile photo must be an actual image of the account holder.
- II. BIODATA LAYER (locked behind security): restricted clinical information. **Doctor-filled information contains**: chronic disease, height, weight, occupation, marital status, religious status, genotype, blood group, clinical conditions, disability, known health preferences. (The subdomain-version profile section later splits this: patient-filled = chronic disease, height, weight, occupation, marital status, religious status; doctor-filled = genotype, blood group, clinical condition, disability, known health preferences — an internal inconsistency carried over from the raw BUILD doc.)
- Clinical condition system: must include timestamps, selectable options, space for written cause/details.
- Edit system: edit button + controlled modification workflow. **Edit approval rule**: patient-editable information requires doctor approval, generates timestamps, maintains modification history.

### Settings system
Controls privacy, visibility, data scope, access behavior, identity management. Allows: hiding profile information (where permitted); censoring institutions/hospitals; restricting visibility to certain locations; changing profile information; deleting account; copying/reporting identity information. **Account deletion rule**: clears visibility/access, removes publicity, retains system-held data.

## Subdomain structure (HOME)
Every institution or private practice possesses its own subdomain, independent management, independent branding, separate operational configuration — "comparable to a creator page system under a larger network infrastructure."

### Institution home page (patient view / primary public institutional interface)
- Announcement system (if applicable): announcements appear above the header; used for alerts, operational notices, emergencies, closures.
- I. HEAD: Left = AWANG branding in white; Center = navigation bar (fast movement through the institution page); Right = institution/server logo. Queue bar: displays queue position and estimated waiting time; only appears if patient has appointment/schedule. **Queue calculation requirement**: queue estimation updates dynamically based on completed consultations, finished appointments, missed schedules, delays, reallocations — for maximum queue accuracy.
- II. SECTION I — Gallery: auto-rotating uploaded gallery; center button "Book Appointment" (primary appointment entry point).
- III. SECTION II — Staff & calendar system: dual-column expandable; both initially 50% viewport width; clicked section expands to 80%, other reduces to 20%. Left = staff (medical staff listing + details; selected staff expands to show specialty, available days, additional information; vertical scrolling on overflow). Right = general calendar (open days, closed days, institution notes, operating hours).
- IV. SECTION III — Authentication access: one IHN account grants access to all institutions under the IHN ecosystem; users authenticate with IHN credentials. Dashboard switching: if user is registered staff OR approved private practice owner, they may switch to the professional dashboard.

### Book Appointment system (two major ways)
- I. AI-assisted routing: patients type their symptoms/problems; "The AI then: allocates departments, suggests suitable departments, routes patient appropriately." **AI role restriction (verbatim): "AI acts only as: guidance, allocation support, department routing assistance. Not diagnosis."**
- II. Manual department selection: patients scroll through departments; only departments offered by the institution should appear.
- Appointment flow after department selection: available dates, times, and doctors appear; once selected — assigned doctor is informed, appointment is logged, relevant biodata/symptoms are shared.
- First-time visit handling: if required, file-opening requirement is indicated and pricing is displayed, including consultation price and registration/file-opening cost.

### Patient dashboard (subdomain view)
Primary operational patient interface / healthcare organization layer / patient continuity structure. Main structure: triple-layer separated by solid bars.
- I. Navigation bar: brand name + account name (left); Profile, Settings (right).
- II. Progress bar: expandable dropdown, two major categories: (1) appointment list; (2) doctor/pinned information — pinned info includes medication, medication dates, meetings, appointment reminders, appointment setup indications.
- III. Visit history: visit history, previous consultations, historical healthcare records. Expansion behavior: can expand to previous month and "extend to all-time history using key system."
- Profile (subdomain version): contains the Biodata Farm; acts as emergency healthcare insight layer and patient trust structure. Two-layer model as above (profile layer freely available; biodata layer secured).

## Security key system
"One of the core interoperability and authorization mechanisms of the platform."
- Key characteristics: keys change frequently, **regenerate every 24 hours**, are fully logged.
- Logging requirements — the system logs: time triggered, account used, information accessed, access session details.
- Key format: **12-character alphanumeric**; appears only when triggered; requires password or biometric confirmation.
- Access flow: key originates from the account being accessed; used on another account to access authorized information.
- Shareable access types: specific records, record collections, biodata, entire profile base, history logs, consultation logs, images, personal uploads.
- Data transfer rule: ALL data transfers require authorization from the data owner; applies to individuals and institutions.
- Abuse policy: abuse may result in penalties; must be addressed in Terms and Guidelines.

## Data governance rules
- Patient file access restriction: hospital-specific files possessed by patients cannot be fully interpreted/read by patients where restricted, but can still be transferred legally.
- Misuse warning: using institutional files improperly for personal misuse may result in legal action.
- Institutional data usage restriction: hospitals/institutions strictly prohibited from using patient data for unrelated interests, financial exploitation, or exposing sensitive patient information without consent.
- Analytics guidance: institutions advised to use analysis dashboards and structured analytics systems "instead of unnecessary raw data exposure." (The raw BUILD doc calls this "the analysis board.")
- Penalty enforcement: unauthorized exposure of sensitive patient data carries penalties and violates system governance rules.

## System-wide infrastructural requirements (the only "stack-like" content — capabilities, not technologies)
"The platform architecture inherently requires: multi-tenant infrastructure; real-time synchronization systems; queue computation engines; role-based access control; audit logging; consent management; healthcare-grade encryption; institution isolation systems; dynamic scheduling systems; high-availability infrastructure; federated authentication; document classification systems; secure upload handling; cross-institution interoperability layers."

## Decisions made vs. open
- Decided (same as BUILD, formalized): AWANG brand; primary domain + institution subdomains; single persistent IHN identity; pending-approval onboarding with doctor-verified blood group/genotype; two-layer profile (public profile / secured biodata) with doctor-approved edits and modification history; 24h-regenerating logged 12-char security keys gating all transfers; dynamic queue computation; wizard-managed marketing/partner content (no hardcoded frontend content); AI restricted to department routing, explicitly not diagnosis; account deletion retains system-held data; per-institution dashboards with role-based professional switch.
- Open/unspecified: no programming languages, frameworks, databases, cloud providers, or third-party services are named anywhere; no API endpoints, schemas, or wire formats; approval workflow actors undefined; pricing/payment processing beyond price display undefined; "key system" for all-time history access mentioned but its UX undefined; announcement authoring flow undefined.

## Contradictions / deltas vs. BUILD_260519_215455.pdf
1. **Upload deletion window (direct conflict)**: BUILD says uploads "only allows deletion 48hrs AFTER upload" (a 48h lock); BUILD-PUBLIC says "Deletion is only permitted within 48 hours after upload" (a 48h window, then permanent). Must be resolved in the spec.
2. Announcement loop frequency: BUILD specifies "limited time (1 loops an hour 4 times)"; BUILD-PUBLIC only says "loop periodically" (drops the number).
3. Search-bar behavior on login screen: BUILD's key rotation "every 24hrs" is retained; consistent.
4. Biodata patient-fill vs doctor-fill split: both docs restate it twice with drift; BUILD-PUBLIC p40 assigns everything to doctor-filled, p66-67 splits patient-filled vs doctor-filled (genotype/blood group/clinical condition/disability/preferences = doctor). The p66-67 split matches BUILD p15 and appears to be the intended one.
5. BUILD-PUBLIC drops BUILD's compulsory-profile "hospital number/affiliation" phrasing into a dedicated Hospital Affiliation registration step (marked "Required" while fields say "if known" — minor internal tension).
6. Otherwise BUILD-PUBLIC is a strict superset/formalization: it adds queue-calculation inputs, AI "not diagnosis" restriction, image-auth specifics (facial authenticity/fraud prevention), account pending-approval state, admin wizard capabilities (reorder/schedule/configure), and the infrastructural requirements list — none of which contradict BUILD.
