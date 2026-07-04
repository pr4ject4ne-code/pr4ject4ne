# AWANG — Integrated Hospital Network (IHN)

Distilled from the founder's 26 source documents (per-document summaries in [docs/research/](docs/research/)). This is the working spec: decisions recorded here override rough notes; open questions are listed at the end.

## What it is

A healthcare platform built around a **persistent patient identity** rather than institution-based records. One AWANG/IHN account works across every participating hospital, clinic, and private practice. Institutions stay independently managed (each gets its own branded subdomain, "like YouTube creator pages") on shared infrastructure.

**Three pillars:** 1. Data (the "Biodata Farm"), 2. Analysis (the analytics tool), 3. Emergency saviour (crucial biodata access when it matters).

**Market:** Nigerian private clinics and hospitals, starting in Enugu. Named prospects: Godfrey Okoye University Teaching Hospital, St. Leo's, Memfey's, Alpha Specialist, St. Mary's, Nikea Specialist, Rosa Mystica. Anchor-partner strategy: a professor/CMD contact opens doors; first trial at a small clinic through him.

**Business model:** B2B SaaS, tiered by clinic size — Tier 1 (1–2 doctors) ₦15k–₦25k/mo; Tier 2 (2–5 doctors) ₦30k–₦60k/mo; Tier 3 (private hospitals) ₦80k–₦150k+/mo; Tier 4 enterprise custom. Patient-volume blocks of 500 (₦5k–₦10k per extra block) — explicitly **not** per-patient-visit fees. Setup fee waived for first 3–5 clinics. Pilot close: 1–2 months free, then ~50% early-partner discount. Analytics is a separately priced add-on ($50/mo patient, $100–200/mo doctor, $500/mo institution). Early goal is adoption and dependence, not revenue.

## Phased roadmap

Per the founder: "The core need and process the 'bait' needs to be flawless on day 1."

- **Phase 1 — MVP (this is what we build now):** basic administration — appointment booking, timing and reminders, the doctor's window (daily patient lineup), queue tracking — plus the backend that powers it. Validate with 2–5 pilot clinics.
- **Phase 2 — Digitalisation & Biodata Farm:** two-layer patient profiles, security-key data sharing, document uploads, cross-institution identity.
- **Phase 3 — Analytics:** wizard-filter graphing over de-identified EHR pools; the flagship paid add-on. Don't mention AI early in sales.
- **Phase 4 — "The Guild" & beyond:** multi-hospital chain administration, personalised private practice space, telemedicine. Nigeria → Africa → international.

## MVP scope (Phase 1)

### Actors
- **Patient** — books appointments, sees queue position and expected wait, gets reminders.
- **Doctor** — sees daily lineup ahead of time (the "doctor's window"), marks consultations complete.
- **Admin/Desk** — manages doctor schedules and capacity, handles walk-ins, sends announcements, oversees the day.

### Features
1. **Online appointment booking** — patient picks department → sees available dates/times/doctors → books. Consultant booking respects capacity tallies; patients already due for a visit take priority if indicated ≥3 days before the consultation date. First-time visits show file-opening requirement and price.
2. **Queue system** — first-come-first-serve over time maps; booking pins a slot; lateness may forfeit the slot (limited late-slot grace). Patient sees live position ("2nd in line") and estimated wait, computed from completed consultations, missed schedules, delays, and reallocations.
3. **Doctor's window** — each doctor sees today's (and upcoming) patient lineup with booking reason before clinic hours.
4. **Reminders & indications** — appointment reminders; "doctor says return in 2 weeks" follow-up warnings.
5. **Admin dashboard** — doctor schedules/capacity, department setup, queue oversight, announcements.
6. **Auth & roles** — email+password login; role-based access (patient / doctor / admin); personnel accounts only exist if added through the admin route.

### Explicit MVP non-goals (deferred, by founder's own strategy)
Biodata Farm layers, 24h security keys, AI symptom routing, analytics/graphs, per-institution subdomains with custom branding, offline-first sync, multi-hospital Guild, telemedicine, HMO/insurance and billing integration. Rule adopted from the notes: **build no new feature unless ≥3 clinics explicitly request it.**

## Architecture

- **Modular monolith, multi-tenant from day 1** (every row carries an institution ID; institution isolation enforced in the data layer). The notes aspire to microservices, but the build capacity is a solo AI-assisted workflow — a well-modularised monolith preserves the option to split later without paying the operational cost now. Modules: identity/auth, scheduling/queue, notifications, admin, (later: biodata, sharing, analytics).
- **Web-first, mobile-responsive** — "access your dashboard from your bed"; UI so self-explanatory "even a 'moron' can understand the basics." Low-bandwidth-friendly pages (target market has unreliable internet).
- **Foundations laid in MVP for later phases:** append-only audit log of every data access (the gated-sharing model is "available but heavily tracked"); RBAC designed so the Patient → Practitioner → Institution hierarchy and class/subclass roles (e.g. doctor[resident|house officer|consultant]) slot in; single shared patient key so replicated permission-scoped data pools can attach later.
- **Stack (proposed, needs sign-off):** TypeScript + Next.js (single deployable, SSR for low-bandwidth, huge ecosystem) + PostgreSQL (row-level security fits the gated model; boring and reliable) + hosted Postgres/app platform within GitHub Education credits. Real-time queue updates via polling first, WebSockets when justified.

## Security & compliance

- **Jurisdiction: Nigeria.** NDPC registration / Nigeria Data Protection Act 2023 compliance is on the critical path — health data is sensitive personal data. Needs proper legal review before real patient data enters the system.
- Encryption in transit and at rest from day 1; healthcare-grade key handling.
- Every access to patient data logged (time, account, information accessed) — this also future-proofs the Phase 2 security-key model (12-char alphanumeric, regenerates every 24h, patient-held, fully logged).
- Institutions prohibited from using patient data for unrelated interests; analytics (Phase 3) is the only permission-free surface and only over de-identified data.
- ⚠ Flag: the notes say account deletion "retains all system-held data" — likely conflicts with NDPA erasure rights; resolve with counsel before launch.

## Contradictions found in sources — adopted resolutions

| Topic | Conflict | Adopted |
|---|---|---|
| Upload deletion | BUILD: deletable only 48h *after* upload · BUILD-PUBLIC: only *within* 48h | **Within 48h** (BUILD-PUBLIC is the formalized, later statement) — revisit with legal |
| Pricing | Per-patient-visit "stipend" vs 500-patient volume blocks | **Volume blocks** (adopted pricing table explicitly rejects per-visit fees) |
| Biodata fill split | One passage marks all fields doctor-filled | **Split:** patient fills lifestyle (chronic disease, height, weight, occupation, marital/religious status); doctor fills clinical (genotype, blood group, timestamped conditions, disability, health preferences); patient edits need doctor approval |
| Validation method | Single anchor hospital vs 5–10-clinic validation rule | **Both:** anchor partner opens doors; feature decisions still require ≥3 clinics asking |
| MVP identity | Pillars docs (data+analytics) vs workflow-first MVP | **Workflow-first MVP**; pillars are the Phase 2–3 destination |

## Open questions (founder input needed)

1. Stack sign-off (proposal above) and hosting budget — GitHub Education credits confirmed?
2. What does "terminal 1 / derived rights to main algorithm" in PROCEEDUAL refer to? IP structuring with the professor-partner should be settled before code that embodies "the algorithm" exists.
3. Biodata-farm monetisation vs "data unreadable except by owner" — the consent/anonymisation model for Phase 3 needs definition (not blocking MVP).
4. What is "161 Maiden Lane" (Notes_260508)?
5. Have any discovery interviews from the Interview guide actually been run? Their findings should shape MVP details (e.g., walk-in handling, which the notes leave open).
6. Exact doctor analytics price within the $100–200 band (Phase 3; not blocking).
