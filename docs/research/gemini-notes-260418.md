# GEMINI NOTES_260418_165518.pdf (15 pages)

## Purpose
Screenshots of the founder's side of a conversation with Gemini (only the founder's replies are captured; the AI's questions are absent). Richest source for security model, MVP scope, go-to-market, partner strategy, and founder background.

## Data security / privacy design (pages 1-3, 9-11)
- Patient data "as hard as I can to be unreadable except in the owner account (even making the data burn itself if there is attempt breach)" — self-destructing data on breach attempt.
- Provider access: a local 24-hour changing code held by the patient, manually input on receipt at a hospital to unlock local/private patient data. A data import menu accepts the code and unlocks intended data locally — scoped to specific data or all data. "This code is only available on patient side so a patient will literally need to give the data to the healthcare provider (only available for 24hrs)."
- Exception: essential data of registered patients and a little history (cause of visit with stamps) may be accessed by the hospital without assistance — does NOT include biodata.
- Poor-network resilience: patient always keeps a local copy of the previous 2 months of data; a small portion patients may not access requires its own access (security reasons, with timestamps to manage discrepancy).
- "Think of it like a chatbox with disappearing messages." Essential features (profile, timing, procedures, cues) have a compulsory offline database; other data may be stored offline only under strict conditions keeping it rigid and hard to access with state encryption (temporary), except provider side (more regulated).
- "Yes encryption will be a key criteria."

## Milestones (in order of advancement, p.10)
1. The administration; 2. The total digitalisation; 3. The biodata farm (key); 4. The personalised medical practice space (key)("not sure if indicated"). "Will make it the greatest healthcare providing service in history."
- Later milestone: online diagnosis/consultation ("keeping it as a private doctor patient relationship") differentiated by accumulated services and resources, "especially the farm" — "but that isn't anytime soon."

## MVP scope (p.14)
"The core need and process the 'bait' needs to be flawless on day 1. The minimum I need is: 1. Basic administration (booking, timing and reminders, doctors window). 2. Backend. Everything else would only be considered after this gets through."

## Founder background & firsthand pain points (p.6)
Founder is a medical student. During posting periods faced: (1) unknown patients showing up (leading to buggy queues); (2) complaints on lack of organisation from desk and consultants; (3) "There was that one time that a patient died from cvd due to logistics issues even though the meds were prepared ahead of time"; (4) lack of equipment (inventory issue); (5) patient transfers (service not locally provided); (6) lots of delays (always happen).

## Partner strategy (p.7-8, 15)
- Anchor partner: "a renowned professor and has been the CMD to 3 hospitals and currently is the one to the hospital (medium scale) I'm at as a student." "Just some recommendations from him will get me to tables with ease"; without him the work is "1/10th of its magnitude."
- Wants him as a lifelong partner "even at the cost of part of my intellectual property," not a stepping stone. Challenges: layering a pitch so the professor sees him as a business partner, not a student; ensuring alignment.
- First trials at a small-scale clinic via this contact. "It's all about building trust and dependency first, profits come later."

## Go-to-market philosophy (p.4-5, 12-13)
- "The plan is to sell the solution and if you can do that well enough, the service or price becomes an afterthought" (Rolex vs G-Shock, $4000 MacBook analogies). Pitch goal: hook the listener from the first minute.
- Rollout: Nigeria first, then Africa, then international — "a monumental challenge to take control of nigeria then africa (can't be rushed...)". Full digitalisation locally and globally is "a glide"; make it fully digital and influence others to make the shift themselves.
- UI/UX must be so self-serving "that even a 'moron' can understand the basics without help," like telling a game's objective without being good at it. Dashboards accessible online ("access your dashboard from your bed").
- Technical view = higher level letting the founder monitor all activities and fix issues while it runs. "Manual" involvement = surveys, observing workflow from multiple perspectives, realtime tutoring of staff on the software (cites Elon/Tesla firsthand-observation lesson). Health sector "has no room for mistakes" — heavy monitoring during trial and a few months after.

## Legal/regulatory
No regulators named, but: IP sharing with the partner (ties to PROCEEDUAL "derived rights to main algorithm"); patient-owned consent-by-code access model; encryption commitment; jurisdiction Nigeria.

## Decisions vs open questions
- Decided: MVP = booking/timing/reminders/doctors-window + backend; patient-held 24h access code; offline-first essentials; 2-month local cache; milestone order; professor as anchor partner; Nigeria-first rollout.
- Open: personalised medical practice space "not sure if indicated"; how the "biodata farm" monetization squares with patient-owned unreadable data (unresolved tension); pitch/equity terms for the professor.

## Contradictions / tensions with other docs
- "Biodata farm" as key asset vs the security promise that data is unreadable except by the owner and biodata is excluded from no-assist hospital access — consent/anonymization model unspecified.
- Single anchor-hospital validation vs Interview guide's 5-10-clinic validation rule.
