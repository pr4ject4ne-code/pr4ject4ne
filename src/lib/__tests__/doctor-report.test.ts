import { resolveDoctorAttribution, buildDoctorReport, type DoctorAttributionLookup } from '@/lib/doctor-report';

/**
 * THE HARD TEST GATE (worklist #29/#30) — a report must never attribute a
 * field to a doctor's name/contact unless there is a `doctor_consent_records`
 * row with consent_status === 'approved' for that EXACT doctor+field. This is
 * the single most important test file in the doctor-report feature; every
 * other polish is secondary to these guarantees.
 */
describe('resolveDoctorAttribution (the hard gate, pure-function level)', () => {
  const DOCTOR_ID = 'doc-1';

  it('(a) no consent record exists at all -> no attribution shown', () => {
    const lookup: DoctorAttributionLookup = {};
    const result = resolveDoctorAttribution(DOCTOR_ID, lookup);
    expect(result.attributed).toBe(false);
    expect(result.doctorName).toBeUndefined();
    expect(result.doctorContact).toBeUndefined();
    // Denial-surfacing decision: NOT silently dropped — the reader is told a
    // doctor was involved but not confirmed, without ever naming them.
    expect(result.note).toMatch(/not yet confirmed/i);
  });

  it('(b) consent record exists with status "denied" -> no attribution shown, denial surfaced (not silently dropped)', () => {
    const lookup: DoctorAttributionLookup = {
      [DOCTOR_ID]: {
        doctor: { id: DOCTOR_ID, name: 'Dr. Should Not Appear', contact_phone: '000', contact_email: null },
        consentStatus: 'denied',
        denialReason: 'Prefers not to be named in patient-facing reports.',
      },
    };
    const result = resolveDoctorAttribution(DOCTOR_ID, lookup);
    expect(result.attributed).toBe(false);
    expect(result.doctorName).toBeUndefined();
    expect(result.doctorContact).toBeUndefined();
    expect(result.note).toMatch(/declined/i);
  });

  it('(b-continued) consent record exists with status "pending" -> no attribution shown', () => {
    const lookup: DoctorAttributionLookup = {
      [DOCTOR_ID]: {
        doctor: { id: DOCTOR_ID, name: 'Dr. Should Not Appear', contact_phone: '000', contact_email: null },
        consentStatus: 'pending',
        denialReason: null,
      },
    };
    const result = resolveDoctorAttribution(DOCTOR_ID, lookup);
    expect(result.attributed).toBe(false);
    expect(result.doctorName).toBeUndefined();
  });

  it('(c) consent record exists with status "approved" -> attribution correctly shown with name/contact', () => {
    const lookup: DoctorAttributionLookup = {
      [DOCTOR_ID]: {
        doctor: { id: DOCTOR_ID, name: 'Ada Obi', contact_phone: '0800-000-0000', contact_email: 'ada@example.com' },
        consentStatus: 'approved',
        denialReason: null,
      },
    };
    const result = resolveDoctorAttribution(DOCTOR_ID, lookup);
    expect(result.attributed).toBe(true);
    expect(result.doctorName).toBe('Ada Obi');
    expect(result.doctorContact).toContain('0800-000-0000');
    expect(result.doctorContact).toContain('ada@example.com');
  });

  it('no doctor_id at all -> not attributed, no note (nothing was ever credited)', () => {
    const result = resolveDoctorAttribution(undefined, {});
    expect(result.attributed).toBe(false);
    expect(result.note).toBeUndefined();
  });

  it('a DIFFERENT doctor being approved does not attribute an uncredited doctor (exact doctor+field match)', () => {
    const OTHER_DOCTOR = 'doc-2';
    const lookup: DoctorAttributionLookup = {
      [OTHER_DOCTOR]: {
        doctor: { id: OTHER_DOCTOR, name: 'Someone Else', contact_phone: null, contact_email: null },
        consentStatus: 'approved',
        denialReason: null,
      },
    };
    const result = resolveDoctorAttribution(DOCTOR_ID, lookup);
    expect(result.attributed).toBe(false);
    expect(result.doctorName).toBeUndefined();
  });
});

describe('buildDoctorReport (end-to-end report assembly)', () => {
  it('includes the photo top-right (photoUrl) and the static declaration', () => {
    const report = buildDoctorReport({ profile_photo_url: 'https://example.com/p.jpg' }, {}, {});
    expect(report.photoUrl).toBe('https://example.com/p.jpg');
    expect(report.declaration).toMatch(/IHN/);
    expect(report.declaration).toMatch(/patient-reported and unverified/);
  });

  it('omits the photo when profile_photo_url was not shared', () => {
    const report = buildDoctorReport({}, {}, {});
    expect(report.photoUrl).toBeNull();
  });

  it('(a) clinical condition with a doctor_id but NO consent record -> annotated as unconfirmed, no signature', () => {
    const report = buildDoctorReport(
      {},
      { clinical_conditions: [{ condition: 'Hypertension', doctor_id: 'doc-1' }] },
      {},
    );
    expect(report.signatures).toEqual([]);
    const cc = report.sections.find((s) => s.key === 'clinical_conditions');
    expect(cc?.rows[0]!.value).toMatch(/not yet confirmed/i);
    expect(cc?.rows[0]!.value).not.toContain('Dr.');
  });

  it('(b) clinical condition credited to a doctor whose consent is DENIED -> no name anywhere in the report, denial surfaced', () => {
    const lookup: DoctorAttributionLookup = {
      'doc-1': {
        doctor: { id: 'doc-1', name: 'Dr. Secret', contact_phone: '000', contact_email: null },
        consentStatus: 'denied',
        denialReason: 'declined',
      },
    };
    const report = buildDoctorReport(
      {},
      { clinical_conditions: [{ condition: 'Hypertension', doctor_id: 'doc-1' }] },
      lookup,
    );
    expect(report.signatures).toEqual([]);
    expect(JSON.stringify(report.sections)).not.toContain('Dr. Secret');
    expect(JSON.stringify(report.sections)).toMatch(/declined/i);
  });

  it('(c) clinical condition credited to a doctor whose consent is APPROVED -> name/contact shown in the row AND the signature block', () => {
    const lookup: DoctorAttributionLookup = {
      'doc-1': {
        doctor: { id: 'doc-1', name: 'Ada Obi', contact_phone: '0800-000-0000', contact_email: null },
        consentStatus: 'approved',
        denialReason: null,
      },
    };
    const report = buildDoctorReport(
      {},
      { clinical_conditions: [{ condition: 'Hypertension', doctor_id: 'doc-1' }] },
      lookup,
    );
    expect(report.signatures).toEqual([{ doctorId: 'doc-1', name: 'Ada Obi', contact: '0800-000-0000' }]);
    const cc = report.sections.find((s) => s.key === 'clinical_conditions');
    expect(cc?.rows[0]!.value).toContain('Ada Obi');
  });

  it('mixed conditions: only the approved doctor is attributed/signed, the others stay unnamed', () => {
    const lookup: DoctorAttributionLookup = {
      'doc-approved': {
        doctor: { id: 'doc-approved', name: 'Approved Doc', contact_phone: '111', contact_email: null },
        consentStatus: 'approved',
        denialReason: null,
      },
      'doc-denied': {
        doctor: { id: 'doc-denied', name: 'Denied Doc', contact_phone: '222', contact_email: null },
        consentStatus: 'denied',
        denialReason: null,
      },
    };
    const report = buildDoctorReport(
      {},
      {
        clinical_conditions: [
          { condition: 'Asthma', doctor_id: 'doc-approved' },
          { condition: 'Migraine', doctor_id: 'doc-denied' },
          { condition: 'Allergy', doctor_id: 'doc-unknown' },
        ],
      },
      lookup,
    );
    expect(report.signatures).toEqual([{ doctorId: 'doc-approved', name: 'Approved Doc', contact: '111' }]);
    const cc = report.sections.find((s) => s.key === 'clinical_conditions')!;
    expect(cc.rows[0]!.value).toContain('Approved Doc');
    expect(cc.rows[1]!.value).not.toContain('Denied Doc');
    expect(cc.rows[2]!.value).not.toContain('doc-unknown');
  });

  it('a doctor credited on multiple conditions only appears once in the signature block', () => {
    const lookup: DoctorAttributionLookup = {
      'doc-1': {
        doctor: { id: 'doc-1', name: 'Ada Obi', contact_phone: '0800', contact_email: null },
        consentStatus: 'approved',
        denialReason: null,
      },
    };
    const report = buildDoctorReport(
      {},
      {
        clinical_conditions: [
          { condition: 'Asthma', doctor_id: 'doc-1' },
          { condition: 'Hypertension', doctor_id: 'doc-1' },
        ],
      },
      lookup,
    );
    expect(report.signatures).toHaveLength(1);
  });

  it('conditions with no doctor_id at all are left completely unmodified (plain patient-reported entries)', () => {
    const report = buildDoctorReport({}, { clinical_conditions: [{ condition: 'Common cold' }] }, {});
    const cc = report.sections.find((s) => s.key === 'clinical_conditions');
    expect(cc?.rows[0]!.value).toBe('Common cold');
  });
});
