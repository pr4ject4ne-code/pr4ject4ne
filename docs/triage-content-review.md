# Triage content review — NOT yet clinician-approved

**Status: outstanding.** This document exists because the homepage symptom
search (worklist #8/#11) contains real triage-adjacent content — a red-flag
emergency list and a symptom-to-specialty routing table — and that content
was authored by engineering/agent process, not a licensed clinician. It must
be reviewed and signed off by a licensed clinician (the founder's anchor
professor/CMD partner, per memory.md, is the obvious first reviewer) before
this feature is considered launch-ready.

## What this covers

1. **The Stage 1 red-flag list** — `src/lib/symptom-red-flags.ts`'s
   `RED_FLAG_SYMPTOMS` whitelist and the `SEVERITY_EMERGENCY_THRESHOLD = 7`
   pain/severity cutoff.
2. **The Stage 2 routing table** — `src/lib/symptom-specialty-map.ts`'s
   `SYMPTOM_ITEMS` closed vocabulary, `REGION_SPECIALTY_MAP` (symptom →
   specialty keyword mapping), and the "defaults to General Medicine when
   ambiguous" fallback rule.

## Clinical grounding this content is based on

Both lists are modeled on published, non-proprietary triage frameworks —
named explicitly here so a reviewing clinician can check the software
against the source, not just against this document's paraphrase:

- **The Manchester Triage System (MTS)** — its "general discriminators"
  (life threat / airway-breathing-circulation compromise, pain, haemorrhage,
  conscious level, temperature, acuteness of onset) shaped the Stage 1
  red-flag categories, and its standard 0-10 pain ruler is the source of the
  severity ≥7 = urgent boundary used here.
- **The Emergency Severity Index (ESI)** — its decision-point structure
  (does this look life-threatening? is the patient high-risk? how many
  resources will this likely need?) informed the "any one red flag fires
  the gate" OR-logic design, rather than a weighted/summed score.
- **Standard region/system-based referral pathways** — the routine mapping
  of "which specialty typically sees this kind of everyday, non-emergency
  presentation" (e.g. eye complaints → ophthalmology, earache → ENG/
  otolaryngology, toothache → dentistry) that any general-practice referral
  guide documents; no single named source, this is the general/common
  pattern reflected in general practice and referral-pathway literature.

## What this system deliberately is NOT

- **Not a diagnostic tool.** It never says "you have X" or "this is likely
  Y" — only "people with symptoms like this usually see: [specialty]" and
  "this is based on which services hospitals list, not an assessment of
  your condition." See `src/app/HomeClient.tsx`'s notice copy and
  `Header.tsx`'s in-picker copy for the enforced exact phrasing.
- **Not a free-text symptom interpreter.** Both the red-flag list and the
  symptom vocabulary are CLOSED — the user only ever picks from a fixed,
  pre-approved list (`RED_FLAG_SYMPTOMS`, `SYMPTOM_ITEMS`). This is a
  deliberate, hard safety requirement (not a style choice): a free-text
  parser could plausibly under- or over-triage in ways nobody explicitly
  reviewed, whereas every possible input through this UI is one of a small,
  auditable set of options.
- **Not a substitute for the emergency-services framing.** Every symptom
  and severity outcome in the UI repeats "if you think this is an
  emergency, call 112 or go to the nearest hospital now" — the app never
  tells anyone to wait, and the emergency outcome itself never ranks or
  filters hospitals, it just points at the nearest ones plus a persistent
  call-112 affordance.

## What a clinician reviewer should specifically check

1. Is the `RED_FLAG_SYMPTOMS` list complete enough for a Nigerian
   general-population user base (are there regionally-relevant red flags
   missing — e.g. severe dehydration from diarrhoeal illness, common local
   presentations of severe malaria)?
2. Is `SEVERITY_EMERGENCY_THRESHOLD = 7` the right cutoff for a
   *self-reported*, unguided slider (no clinician is present to calibrate
   the patient's own 0-10 scale), or should the copy around the slider be
   strengthened/reworded?
3. Does any entry in `SYMPTOM_ITEMS` (the non-emergency vocabulary)
   actually risk under-triaging a presentation that can sometimes be
   serious (e.g. "sore throat" can occasionally indicate epiglottitis,
   "mild eye pain" can occasionally be acute angle-closure glaucoma)? If
   so, should some of these carry an additional "if X, treat as urgent
   instead" caveat in the UI copy?
4. Is the region → specialty mapping (`REGION_SPECIALTY_MAP`) reasonable
   for how Nigerian hospitals actually staff and label their departments,
   or does it need adjusting (e.g. some facilities may not distinguish
   "general medicine" from "internal medicine" at all)?

## Where to make changes once reviewed

Both whitelists are single-source-of-truth modules with inline comments
(`src/lib/symptom-red-flags.ts`, `src/lib/symptom-specialty-map.ts`) — a
clinician's feedback should land as edits to those files plus their test
files, not scattered across the UI components that merely render them.
