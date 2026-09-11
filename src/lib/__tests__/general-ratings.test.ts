const mockTxQuery = jest.fn();
const mockQuery = jest.fn();
const mockQueryOne = jest.fn();
const mockCheckRateLimit = jest.fn();

jest.mock('@/lib/db', () => ({
  query: (...a: unknown[]) => mockQuery(...a),
  queryOne: (...a: unknown[]) => mockQueryOne(...a),
  withTransaction: (fn: (tx: { query: (...a: unknown[]) => unknown }) => unknown) =>
    fn({ query: (...a: unknown[]) => mockTxQuery(...a) }),
}));
jest.mock('@/lib/auth', () => ({ checkRateLimit: (...a: unknown[]) => mockCheckRateLimit(...a) }));

import {
  submitGeneralRating,
  fetchGeneralRatingSummary,
  fetchPatientGeneralRating,
  checkGeneralRatingUserRateLimit,
  checkGeneralRatingHospitalRateLimit,
} from '@/lib/general-ratings';

const HOSP_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const USER_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

beforeEach(() => jest.clearAllMocks());

describe('submitGeneralRating', () => {
  it('returns null when the hospital does not exist or is not approved', async () => {
    mockTxQuery.mockResolvedValueOnce({ rows: [] });
    const result = await submitGeneralRating(HOSP_ID, USER_ID, 4, null);
    expect(result).toBeNull();
    expect(mockTxQuery).toHaveBeenCalledTimes(1);
  });

  it('upserts on (hospital_id, patient_user_id) and recomputes the shared aggregate', async () => {
    mockTxQuery
      .mockResolvedValueOnce({ rows: [{ id: 'gr1' }] })
      .mockResolvedValueOnce({ rows: [{ avg: '4.00', count: '1' }] }) // recompute: general avg
      .mockResolvedValueOnce({ rows: [{ avg: null, count: '0' }] }) // recompute: indepth avg
      .mockResolvedValueOnce({ rows: [] }) // recompute: UPDATE
      .mockResolvedValueOnce({ rows: [{ rating_avg: '4.00', rating_count: '1' }] })
      .mockResolvedValueOnce({ rows: [{ avg: '4.00', count: '1' }] });

    const result = await submitGeneralRating(HOSP_ID, USER_ID, 4, 'Great overall');
    expect(result).toEqual({
      general_avg: 4,
      general_count: 1,
      hospital_rating_avg: 4,
      hospital_rating_count: 1,
    });

    const insertSql = mockTxQuery.mock.calls[0]![0] as string;
    expect(insertSql).toContain('ON CONFLICT (hospital_id, patient_user_id)');
  });

  it('sanitizes the review text', async () => {
    mockTxQuery
      .mockResolvedValueOnce({ rows: [{ id: 'gr1' }] })
      .mockResolvedValueOnce({ rows: [{ avg: '4.00', count: '1' }] })
      .mockResolvedValueOnce({ rows: [{ avg: null, count: '0' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ rating_avg: '4.00', rating_count: '1' }] })
      .mockResolvedValueOnce({ rows: [{ avg: '4.00', count: '1' }] });

    await submitGeneralRating(HOSP_ID, USER_ID, 4, '<script>bad</script>');
    const [, params] = mockTxQuery.mock.calls[0] as [string, unknown[]];
    expect(params[3]).not.toContain('<script>');
  });
});

describe('fetchGeneralRatingSummary', () => {
  it('excludes disputed ratings and returns 0/0 when there are none', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ avg: null, count: '0' }] });
    const result = await fetchGeneralRatingSummary(HOSP_ID);
    expect(result).toEqual({ avg: 0, count: 0 });
    const sql = mockQuery.mock.calls[0]![0] as string;
    expect(sql).toMatch(/NOT EXISTS[\s\S]*rating_disputes/);
  });

  it('returns the real average/count when ratings exist', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ avg: '3.667', count: '3' }] });
    expect(await fetchGeneralRatingSummary(HOSP_ID)).toEqual({ avg: 3.667, count: 3 });
  });
});

describe('fetchPatientGeneralRating', () => {
  it('returns null when the patient has not rated this hospital', async () => {
    mockQueryOne.mockResolvedValueOnce(null);
    expect(await fetchPatientGeneralRating(HOSP_ID, USER_ID)).toBeNull();
  });

  it('returns the patient\'s own rating', async () => {
    mockQueryOne.mockResolvedValueOnce({ id: 'gr1', score: 5, review: 'Loved it' });
    expect(await fetchPatientGeneralRating(HOSP_ID, USER_ID)).toEqual({ id: 'gr1', score: 5, review: 'Loved it' });
  });
});

describe('rate limit buckets', () => {
  it('checks per-user and per-hospital buckets independently', async () => {
    mockCheckRateLimit.mockResolvedValue(true);
    await checkGeneralRatingUserRateLimit(USER_ID);
    await checkGeneralRatingHospitalRateLimit(HOSP_ID);
    expect(mockCheckRateLimit).toHaveBeenNthCalledWith(1, `general_rating_user:${USER_ID}`, 20, 86400);
    expect(mockCheckRateLimit).toHaveBeenNthCalledWith(2, `general_rating_hospital:${HOSP_ID}`, 200, 86400);
  });
});
