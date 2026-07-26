import { buildBiodataDocument, type DocumentSection } from './biodata-document';
import type { BiodataLayer, ProfileLayer, ConsentStatus } from '@/types';

/**
 * Assembles the final "generate a report from IHN data" document (worklist
 * #29), building on #24's `buildBiodataDocument` (never forking a second
 * document-building path) — this module only adds: the profile photo
 * (top-right, display concern left to the consuming UI), a static
 * declaration block, and — the actual hard part — a doctor signature block
 * that is gated strictly on `doctor_consent_records.consent_status ===
 * 'approved'` for the EXACT doctor+field combination (worklist #30).
 *
 * Pure and DB-independent: callers resolve doctor + consent-status lookups
 * via src/lib/doctor-consent-db.ts (DB-touching) and pass the result in here.
 * This module must NEVER perform its own read of biodata — the caller is
 * responsible for having already run the result through
 * `filterBiodataBySharingPrefs` (worklist #23), per the pre-authorized scope
 * decision that a report is built FROM an already-filtered read, not a
 * second unfiltered one.
 *
 * DENIAL-SURFACING DECISION (documented, not left implicit): when a credited
 * doctor's consent is `denied`, `pending`, or has no record at all, this
 * module NEVER shows that doctor's name/contact — but it DOES attach a
 * short, doctor-anonymous note to the affected row ("doctor input requested,
 * not yet confirmed" / "doctor declined to be credited as the source") so a
 * reader knows the field lacks doctor verification, rather than silently
 * looking identical to a plain patient-reported entry. This was judged more
 * transparent/product-appropriate than fully hiding the fact that a doctor
 * was ever involved, while never leaking WHO that doctor is without consent.
 */

export interface DoctorAttributionEntry {
  doctor: { id: string; name: string; contact_phone: string | null; contact_email: string | null };
  /** The doctor's most recent consent status, or null if no record exists at
   * all for this doctor — the migration 014 default-deny "absence of a row
   * IS the not-consented state". */
  consentStatus: ConsentStatus | null;
  denialReason: string | null;
}

/** Keyed by doctor_id. */
export type DoctorAttributionLookup = Record<string, DoctorAttributionEntry>;

export interface AttributionResolution {
  /** True ONLY when consentStatus === 'approved' for this exact doctor. This
   * is the one boolean the hard test gate (doctor-report.test.ts) checks. */
  attributed: boolean;
  /** Doctor-anonymous note shown when NOT attributed but a doctor_id was
   * present (i.e. a doctor WAS credited internally, just not shown). */
  note?: string;
  doctorName?: string;
  doctorContact?: string | null;
}

function formatContact(entry: DoctorAttributionEntry['doctor']): string | null {
  const parts = [entry.contact_phone, entry.contact_email].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : null;
}

/**
 * The single choke point every doctor-attribution decision in this file goes
 * through. No caller may bypass this to show a doctor's name directly.
 */
export function resolveDoctorAttribution(
  doctorId: string | undefined,
  lookup: DoctorAttributionLookup,
): AttributionResolution {
  if (!doctorId) return { attributed: false };

  const entry = lookup[doctorId];
  if (!entry || entry.consentStatus == null) {
    // (a) no consent record exists at all -> no attribution shown.
    return { attributed: false, note: 'Doctor input requested — not yet confirmed.' };
  }
  if (entry.consentStatus === 'denied') {
    // (b) denied -> no attribution shown; denial is surfaced, not silently dropped.
    return { attributed: false, note: 'A doctor was asked to confirm this but declined to be credited.' };
  }
  if (entry.consentStatus === 'pending') {
    return { attributed: false, note: 'Doctor contacted — awaiting a consent decision.' };
  }
  // (c) approved -> attribution correctly shown with that doctor's name/contact.
  return {
    attributed: true,
    doctorName: entry.doctor.name,
    doctorContact: formatContact(entry.doctor),
  };
}

export interface DoctorReportSignature {
  doctorId: string;
  name: string;
  contact: string | null;
}

export interface DoctorReport {
  generatedAt: string;
  photoUrl: string | null;
  declaration: string;
  sections: DocumentSection[];
  /** Only doctors with an approved consent record for at least one credited
   * field ever appear here — this is the enforcement point the hard test
   * gate exercises end-to-end (not just the pure resolver above). */
  signatures: DoctorReportSignature[];
}

function buildDeclaration(generatedAt: string): string {
  const date = new Date(generatedAt).toLocaleDateString();
  return (
    `This report reflects information the account holder has chosen to share via their IHN ` +
    `code as of ${date}. Fields marked with a doctor attribution have been confirmed with that ` +
    `doctor's explicit consent; fields without such marking are patient-reported and unverified.`
  );
}

/**
 * Re-derives clinical-condition attribution notes and folds them onto the
 * value strings `buildBiodataDocument` already produced (same order,
 * one-to-one with `biodataLayer.clinical_conditions`) rather than
 * reformatting the section independently.
 */
function annotateClinicalConditions(
  sections: DocumentSection[],
  biodataLayer: Partial<BiodataLayer>,
  lookup: DoctorAttributionLookup,
): { sections: DocumentSection[]; signatures: DoctorReportSignature[] } {
  const conditions = biodataLayer.clinical_conditions ?? [];
  const signatureMap = new Map<string, DoctorReportSignature>();

  const nextSections = sections.map((section) => {
    if (section.key !== 'clinical_conditions') return section;
    const rows = section.rows.map((row, i) => {
      const condition = conditions[i];
      const resolution = resolveDoctorAttribution(condition?.doctor_id, lookup);
      if (resolution.attributed) {
        if (condition?.doctor_id) {
          signatureMap.set(condition.doctor_id, {
            doctorId: condition.doctor_id,
            name: resolution.doctorName!,
            contact: resolution.doctorContact ?? null,
          });
        }
        return { ...row, value: `${row.value} — confirmed by Dr. ${resolution.doctorName}` };
      }
      if (resolution.note) {
        return { ...row, value: `${row.value} (${resolution.note})` };
      }
      return row;
    });
    return { ...section, rows };
  });

  return { sections: nextSections, signatures: Array.from(signatureMap.values()) };
}

/**
 * Builds the full report. `profileLayer`/`biodataLayer` MUST already be the
 * result of `filterBiodataBySharingPrefs` (or the owner's own unfiltered
 * data, for a self-generated report) — never a raw/unfiltered read.
 */
export function buildDoctorReport(
  profileLayer: Partial<ProfileLayer>,
  biodataLayer: Partial<BiodataLayer>,
  doctorLookup: DoctorAttributionLookup,
  generatedAt: string = new Date().toISOString(),
): DoctorReport {
  const baseSections = buildBiodataDocument(profileLayer, biodataLayer);
  const { sections, signatures } = annotateClinicalConditions(baseSections, biodataLayer, doctorLookup);

  return {
    generatedAt,
    photoUrl: profileLayer.profile_photo_url ?? null,
    declaration: buildDeclaration(generatedAt),
    sections,
    signatures,
  };
}
