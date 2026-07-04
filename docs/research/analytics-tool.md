# The Analytics tool (260509) — Summary

Source: `The Analytics tool_260509_050320.pdf` (4 pages, image-only; continuous prose, no headings).

## Purpose
Describes the platform's flagship paid feature: an interactive graphing/analytics tool over the platform's Electronic Health Records (EHR). Called "one of my most important features" and "our most expensive feature". Uniquely, it is "the only one that allows free use of information without taking permissions first" — i.e., it bypasses the platform's gated-permission model (data is pre-aggregated/de-identified instead).

## How it works (author's intent)
- Available to patients, doctors, and institutions.
- UI: "a button seen on every information pool that opens a wizard (filter) to choose the features of the graph and then it produces it". So: every data pool has an analyze button -> filter wizard -> generated graph. (Full feature list "told soon" — not in this doc.)
- **Patient use**: plots several graphs representing status, disease condition, "basic routine test (actual basal test like food consumed, urinalysis, etc and can be used for weight gain or athletic improvement)"; plots "a trajectory of the patient" and makes "a master graph on it" (composite of all metrics).
- **Doctor use**: two scopes — "personal (data on them)" [data stored on their own patients] or "public" which uses "all the data they have stored form their patients" [platform-wide pool]. Doctors "select specific diseases and conditions required to get specific graphs from the Electronic Health Records". Enables using individual cases toward research "in the analysis space", but "revealing information (name and other sensitive data) would not be disclosed" — de-identified research analytics.
- Data ownership rule: "The information refers to any uploaded patient information in the practitioner name except if done under institution" — records uploaded by a doctor belong to the doctor's name unless uploaded under an institution.
- **Hospital/institution use**: "privy to the same information use just like doctors"; doctors' extra benefit is portability — they keep use of the info they have "even if they leave the hospitals or work individual (private) but can't be used off system" (data never leaves the platform).

## Pricing (verbatim numbers)
- $50/month — personal (patient) use.
- $100–$200/month — doctor use, "irrespective of place of work (more personalised for their use on their patients)". Explicit: "(This doesn't cover the private practice fee)" — the analytics fee is separate from a private-practice fee that exists elsewhere in the product.
- $500/month — institutions.

## Anti-abuse rule (verbatim intent)
"NB: To stop abuse of private practice, every patient uploaded to the database will be paid on regardless of the price and failure of uploaded patients to be dealt with on site (payments as well) results in penalty." — i.e., per-patient-upload charge applies no matter what, and patients uploaded but not handled on-platform (including their payments) trigger a penalty.

## Decisions made vs. open
- Decided: role-scoped analytics (patient/doctor/institution), wizard-filter graph UI on every data pool, de-identification instead of per-use permission, doctor data portability within the system only, price points, per-upload payment + penalty rule.
- Open: the actual list of graph features ("features told soon"), implementation/stack (no technology, framework, chart library, or API is named anywhere), exact doctor price within the $100–$200 band.

## Cross-doc notes
- Consistent with Backend Blueprint's "AI Routing Logic": analysis on enterprise level hides sensitive info; analytics is the permission-free surface because data is de-identified.
- Backend Blueprint restricts AI analysis to "private practice and plus service on personal" — this doc prices analytics for institutions too ($500/mo); reconcile whether institutional analytics excludes the AI component or the restriction only concerns small samples.
- Pricing here is standalone; other pricing docs (Pitch-PRICING, PRICING) exist in the corpus and should be checked for conflicts.
