/**
 * Unit-level (mocked DB) tests for fetchDoctorAttributionLookup — the
 * (doctor, patient)-scoped resolution query (migration 016). The REAL
 * exploit-closing proof against actual Postgres SQL semantics lives in
 * src/lib/__tests__/backend.integration.test.ts; this file proves the
 * function wires the patient scope into the query/params correctly and
 * never falls back to a doctor-only lookup.
 */
const mockQuery = jest.fn();
jest.mock('@/lib/db', () => ({
  query: (...a: unknown[]) => mockQuery(...a),
}));

import { fetchDoctorAttributionLookup } from '@/lib/doctor-consent-db';

const DOCTOR_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PATIENT_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

describe('fetchDoctorAttributionLookup', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns {} without touching the DB when no doctor ids are given', async () => {
    const result = await fetchDoctorAttributionLookup([], PATIENT_ID);
    expect(result).toEqual({});
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('passes patientUserId as a query parameter, and the SQL scopes the lateral join on BOTH doctor_id and patient_user_id', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await fetchDoctorAttributionLookup([DOCTOR_ID], PATIENT_ID);

    expect(mockQuery).toHaveBeenCalledTimes(1);
    const [sql, params] = mockQuery.mock.calls[0]!;
    expect(params).toEqual([[DOCTOR_ID], PATIENT_ID]);
    expect(sql).toMatch(/r\.doctor_id\s*=\s*d\.id/);
    expect(sql).toMatch(/r\.patient_user_id\s*=\s*\$2/);
    // Deterministic tie-break (medium-severity finding): a secondary sort key
    // so two rows with an identical created_at never resolve non-deterministically.
    expect(sql).toMatch(/ORDER BY r\.created_at DESC, r\.id DESC/);
  });

  it('de-dupes doctor ids before querying', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await fetchDoctorAttributionLookup([DOCTOR_ID, DOCTOR_ID], PATIENT_ID);
    const params = mockQuery.mock.calls[0]![1] as unknown[];
    expect(params[0]).toEqual([DOCTOR_ID]);
  });

  it('builds the lookup keyed by doctor_id from the resolved rows', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: DOCTOR_ID,
          name: 'Dr. Itest',
          contact_phone: '000',
          contact_email: null,
          consent_status: 'approved',
          denial_reason: null,
        },
      ],
    });
    const result = await fetchDoctorAttributionLookup([DOCTOR_ID], PATIENT_ID);
    expect(result[DOCTOR_ID]).toEqual({
      doctor: { id: DOCTOR_ID, name: 'Dr. Itest', contact_phone: '000', contact_email: null },
      consentStatus: 'approved',
      denialReason: null,
    });
  });
});
