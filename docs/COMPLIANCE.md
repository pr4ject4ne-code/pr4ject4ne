# Compliance — Racoon Eye v1

Racoon Eye handles Nigerian patients' personal and health data, so data-protection
compliance is on the critical path. This is deliberately a **separate legal
workstream** from the code security controls (those live in `docs/SECURITY.md`).
It is deferred to post-launch and does not block the v1 launch, but every item
below must be tracked to completion before scaling.

## Post-launch checklist

- [ ] **NDPC registration** — register with the Nigeria Data Protection Commission
      as a data controller/processor under the NDPA. Confirm whether a Data
      Protection Compliance Organisation (DPCO) filing / annual audit applies at our
      data volume.
- [ ] **Data-protection agreements with clinics** — before any hospital/clinic
      manages patient-facing data through the portal, execute a data-processing
      agreement defining roles (controller vs. processor), permitted use, retention,
      and breach-notification duties.
- [x] **First-aid disclaimer in-app** — the "educational reference only, not legal
      medical advice, always back-check with professionals" disclaimer is displayed
      on every first-aid page and in the Terms & Conditions. (Done.)
- [ ] **Audit-log retention policy** — define how long `audit_logs` rows are kept,
      and a lawful basis for that period. Currently rows are written append-only and
      never pruned (see L3 in `docs/SECURITY.md`); a retention + secure-disposal
      schedule is still needed.
- [ ] **Data-subject rights** — implement/operationalize access, correction, and
      erasure requests for patient accounts and biodata, consistent with NDPA rights.
- [ ] **Breach response plan** — document detection, containment, and the NDPA
      notification timeline.

## Standing note — unverified clinical fields

The biodata clinical fields (genotype, blood group, chronic conditions, etc.) are
**self-entered and unverified**. There is no doctor-verification workflow in v1, so
these values must not be treated as clinically authoritative by any downstream
consumer. The "official-document-recommended" framing in the UI is guidance, not
enforcement. Doctor verification is a later-phase feature; until it ships, any
clinical use of these fields is at the reader's own risk and must be back-checked
against primary medical records.
