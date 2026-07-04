# Backend Blueprint-RAW (260519) — Summary

Source: `Backend Blueprint-RAW_260519_224730.pdf` (5 pages, image-only; page 5 blank). Written as a raw outline/response to someone ("So below I will send another file to help", "You made your changes") — many sections are headers with placeholder text deferring to other documents or prior discussion.

## Purpose
A skeleton of the system architecture for the Ihn healthcare platform, self-described as "Very Bulky (Will be cut short)". Captures the core architectural principle plus stubs for every architecture topic the founder intends to cover. It is NOT a complete blueprint — most sections defer elsewhere.

## Core architectural intent (substantive content)

**Gated information sharing (the central principle)**
- "The architecture relies majorly on a Gated information sharing."
- Information is kept *available* but *highly tracked* to avoid leaks. Framed as "Gated channels".
- Rationale: keeps data organised and "brings people to the healthcare".

**Database/Data Relationship Structure**
- Databases "will be numerous and unique with different bases for the same information, containing same unique key but different access level or permission."
- i.e., the same record is replicated across multiple stores keyed by one shared unique key, with each store scoped to a different access/permission level. Called "crucial".

**Role & Permission Hierarchy**
- Hierarchy: Patient -> Physician/"Practicioneer" -> Institution.
- Explicitly noted that the hierarchy "doesn't mean that information can be accessed on all levels" — access is constrained by possessions/permissions at each level. "Every stage is unique."
- A separate file with the full hierarchy was promised ("below I will send another file to help").

**Queue Computation Logic** (appointments)
- "Very complex actually. More of a first come first serve."
- There are "time maps"; booking an appointment = pinning an available time slot.
- If you don't make it on time you "may have to relinquish the consultation. (Except in space for new late individual" — i.e., late arrivals can lose the slot unless there is room to slot them in late.

**AI Routing Logic**
- "Mostly for the analysis" (ties to the Analytics tool doc).
- Cannot be used "on small sample on enterprise-grade level" — AI analysis is "restricted to private practice and plus service on personal" tiers.
- On enterprise level it "collates the data ... hides sensitive info and uses other info to get result" (de-identification before enterprise analytics).

## Stub sections (headers with no content here)
- Microservice Breakdown — "Also see below" (implies a microservice architecture is intended, but breakdown lives elsewhere).
- UI/UX Flow Mapping — "Some below. Most discussed. Ux is the most important so we've set up all non cosmetic framework."
- Security & Compliance Framework — "You made your changes" (delegated to collaborator's edits).
- Institution Workflow Logic — "Also the permission system" (workflow = permission system).
- Infrastructure Scaling Design — "Not in near future" (explicitly deferred).
- Healthcare Governance Model — "Already discussed".
- API & Interoperability Layer — "Explain already" [sic].
- Real-Time Event Architecture — header only, no text.
- Technical Build Stack Structure — header only, no text.
- Legal/Regulatory Mapping by Region — header only, no text.

## Decisions made vs. open
- Decided: gated/tracked data sharing model; per-access-level replicated databases sharing one unique key; Patient->Practitioner->Institution role hierarchy; FCFS queue with time maps and relinquish-on-late rule; AI analysis tier restrictions (no enterprise small-sample use; de-identified at enterprise level); scaling design deferred.
- Open/undefined in this doc: entire tech stack, microservice list, API layer, real-time events, security framework details, regional legal mapping. No concrete technology, framework, or API is named anywhere in this document.

## Contradictions / notes vs. other docs
- Names no stack, so cannot conflict on technology; but "Microservice Breakdown" implies microservices while Setup doc (see setup.md) describes a lean 2-3 person team + no-code/AI-assisted build — a tension between architecture ambition and build capacity.
- AI tier restriction (private practice + personal "plus service" only) is a pricing/packaging constraint the Analytics doc must respect.
