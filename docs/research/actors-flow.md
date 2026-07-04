# Analysis _260328_084909.pdf (2 pages, page 2 blank)

## Purpose
A single-page structural breakdown of hospital actors — a role hierarchy ("FLOW") the system must model. This is the raw domain model for users/roles.

## Content (verbatim tree, preserved)
```
FLOW
Personnel
├── Desk
│   ├── HMO
│   ├── Finance
│   ├── Customer Service
│   ├── Transport
│   ├── Security
│   ├── Clerk
│   ├── Liaison
│   └── HR
├── Sanitary
├── Lab
├── Nurse
└── Doctor
    ├── House Officer
    ├── Resident
    └── Consultant
        └── Radiology(example)
Customer
└── Patient
```

## Interpretation / decisions implied
- Two top-level actor classes: **Personnel** (staff) and **Customer** (Patient only).
- Personnel splits into Desk (8 administrative sub-roles: HMO, Finance, Customer Service, Transport, Security, Clerk, Liaison, HR), Sanitary, Lab, Nurse, Doctor.
- Doctor has a seniority hierarchy: House Officer / Resident / Consultant, with specialty under Consultant ("Radiology" given as example).
- HMO (health maintenance organization desk) and Finance as desk roles signal billing/insurance workflows are in scope.

## Open questions
No pricing, no numbers, no decision text — purely the role taxonomy. How these roles map to app permissions is elaborated elsewhere (Workflow ranking's Administrative/Doctor/Patient views "rely on tiers and departments for increased authority").

## Contradictions
None; consistent with the three-view split in Workflow ranking.
