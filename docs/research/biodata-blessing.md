# Biodata — blessing to healthcare (Biodata- blessing to healthcare_260417_202324.pdf, 2 pages)

## Purpose
Founder spec for the patient profile/biodata feature — the data model and access structure for pillar 1 (Data) and pillar 3 (Emergency saviour). Framed by an outline the author intended to cover: "The profile biodata / How it benefits patients / How to access / The info it provides" (only structure + fields are actually written out).

## Product vision
The biodata is called **"The Biodata 'FARM'"** and is described as:
> "One of the KEYs to our success. The biodata will serve as the greatest source of trust for immediate healthcare measures and insight into health choices."

So it serves two purposes: trust for immediate (emergency) care measures, and insight into health choices (feeds the Analysis pillar).

## Structure (concrete decisions)
- Located in the **profile tab** of the app; **2 layers**: PROFILE and BIODATA.
- **i. PROFILE (FREELY AVAILABLE)** — basic voluntary and compulsory info.
  - Compulsory: "Name(full name, can add alias under if applicable), Gender, contact info(phone and email), Date of birth(may be hidden on preferences), next of kin contact."
  - Not compulsory: "address"
- **ii. BIODATA (LOCKED BEHIND SERCURITY)** — split by who fills it:
  - **PATIENT FILL**: "chronic disease, height, weight, Occupation, Marital Status, religious status"
  - **DOCTOR FILL**: "Genotype, Blood group, clinical condition (with timestamp)(options with space to write cause), Disability, any known health preferences"

## Key design implications
- Two-tier access control is a hard requirement: free/public profile layer vs security-locked biodata layer.
- Field provenance matters: patient-entered vs doctor-entered fields are distinct; doctor-fill clinical conditions require timestamps and a free-text cause field.
- Next of kin contact is compulsory — consistent with the "Emergency saviour" pillar.

## Open questions
- "How to access" and "How it benefits patients" sections are named in the outline but never written — the security mechanism guarding the biodata layer is unspecified (who unlocks it, how, in emergencies).
- Whether "religious status" affects care preferences (likely relates to "any known health preferences") is unstated.
- No mention of consent flow, doctor verification, or edit permissions.

## Contradictions with other docs
- None direct, but "Walls of importance" (advice doc) pushes an MVP of clinic workflow/appointments with no patient-data emphasis; this doc makes patient biodata the "KEY to our success." Tension: patient-record-first vs clinic-ops-first product identity.
