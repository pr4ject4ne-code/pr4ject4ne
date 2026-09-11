/**
 * Unit-level (mocked DB) tests for fetchDoctorAttributionLookup — now
 * (doctor, patient, clinical_condition)-scoped resolution (migration 029,
 * item 4's per-field consent rework — migration 016 only got as far as
 * (doctor, patient)). The REAL exploit-closing proof against actual
 * Postgres SQL semantics lives in src/lib/__tests__/backend.integration.test.ts;
 * this file proves the function wires the field scope into the
 * query/params correctly and never falls back to a doctor-only or
 * doctor+patient-only lookup.
 */
const mockQuery = jest.fn();
jest.mock('@/lib/db', () => ({
  query: (...a: unknown[]) => mockQuery(...a),
}));

import { fetchDoctorAttributionLookup } from '@/lib/doctor-consent-db';

const DOCTOR_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PATIENT_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const CONDITION_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

describe('fetchDoctorAttributionLookup', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns {} without touching the DB when no pairs are given', async () => {
    const result = await fetchDoctorAttributionLookup([], PATIENT_ID);
    expect(result).toEqual({});
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('passes patientUserId as a query parameter, and the SQL scopes the lateral join on doctor_id, patient_user_id, AND clinical_condition_id', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await fetchDoctorAttributionLookup([{ doctorId: DOCTOR_ID, conditionId: CONDITION_ID }], PATIENT_ID);

    expect(mockQuery).toHaveBeenCalledTimes(1);
    const [sql, params] = mockQuery.mock.calls[0]!;
    expect(params).toEqual([[DOCTOR_ID], [CONDITION_ID], PATIENT_ID]);
    expect(sql).toMatch(/r\.doctor_id\s*=\s*d\.id/);
    expect(sql).toMatch(/r\.patient_user_id\s*=\s*\$3/);
    expect(sql).toMatch(/r\.clinical_condition_id\s*=\s*fid\.condition_id/);
    // Deterministic tie-break: a secondary sort key so two rows with an
    // identical created_at never resolve non-deterministically.
    expect(sql).toMatch(/ORDER BY r\.created_at DESC, r\.id DESC/);
  });

  it('de-dupes pairs before querying', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await fetchDoctorAttributionLookup(
      [
        { doctorId: DOCTOR_ID, conditionId: CONDITION_ID },
        { doctorId: DOCTOR_ID, conditionId: CONDITION_ID },
      ],
      PATIENT_ID,
    );
    const params = mockQuery.mock.calls[0]![1] as unknown[];
    expect(params[0]).toEqual([DOCTOR_ID]);
    expect(params[1]).toEqual([CONDITION_ID]);
  });

  it('builds the lookup keyed by `${doctorId}:${conditionId}` from the resolved rows', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: DOCTOR_ID,
          name: 'Dr. Itest',
          contact_phone: '000',
          contact_email: null,
          condition_id: CONDITION_ID,
          consent_status: 'approved',
          denial_reason: null,
        },
      ],
    });
    const result = await fetchDoctorAttributionLookup([{ doctorId: DOCTOR_ID, conditionId: CONDITION_ID }], PATIENT_ID);
    expect(result[`${DOCTOR_ID}:${CONDITION_ID}`]).toEqual({
      doctor: { id: DOCTOR_ID, name: 'Dr. Itest', contact_phone: '000', contact_email: null },
      consentStatus: 'approved',
      denialReason: null,
    });
  });

  it('never leaks a row for a condition id that was not actually requested (defense against the CROSS JOIN over-fetching)', async () => {
    const OTHER_CONDITION = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: DOCTOR_ID,
          name: 'Dr. Itest',
          contact_phone: null,
          contact_email: null,
          condition_id: OTHER_CONDITION,
          consent_status: 'approved',
          denial_reason: null,
        },
      ],
    });
    const result = await fetchDoctorAttributionLookup([{ doctorId: DOCTOR_ID, conditionId: CONDITION_ID }], PATIENT_ID);
    expect(result[`${DOCTOR_ID}:${OTHER_CONDITION}`]).toBeUndefined();
  });
});
