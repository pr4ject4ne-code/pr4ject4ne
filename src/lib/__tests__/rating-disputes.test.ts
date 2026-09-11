const mockQuery = jest.fn();
const mockQueryOne = jest.fn();
const mockTxQuery = jest.fn();

jest.mock('@/lib/db', () => ({
  query: (...a: unknown[]) => mockQuery(...a),
  queryOne: (...a: unknown[]) => mockQueryOne(...a),
  withTransaction: (fn: (tx: { query: (...a: unknown[]) => unknown }) => unknown) =>
    fn({ query: (...a: unknown[]) => mockTxQuery(...a) }),
}));

import { fileDispute, listPendingDisputes, listDisputesForHospital, resolveDispute, findDisputeById } from '@/lib/rating-disputes';

const HOSP_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const RATING_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const USER_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const DISPUTE_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

beforeEach(() => jest.clearAllMocks());

describe('fileDispute', () => {
  it('returns null (does not throw) when the complaint is empty/whitespace-only', async () => {
    expect(await fileDispute(HOSP_ID, 'general', RATING_ID, USER_ID, '   ')).toBeNull();
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('targets general_ratings when ratingType is general', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: DISPUTE_ID }] });
    await fileDispute(HOSP_ID, 'general', RATING_ID, USER_ID, 'This is unfair');
    const sql = mockQuery.mock.calls[0]![0] as string;
    expect(sql).toContain('general_rating_id');
    expect(sql).toContain('FROM general_ratings');
  });

  it('targets department_ratings when ratingType is department', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: DISPUTE_ID }] });
    await fileDispute(HOSP_ID, 'department', RATING_ID, USER_ID, 'This is unfair');
    const sql = mockQuery.mock.calls[0]![0] as string;
    expect(sql).toContain('department_rating_id');
    expect(sql).toContain('FROM department_ratings');
  });

  it('returns null when the WHERE EXISTS check fails (rating not found / not this hospital\'s)', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    expect(await fileDispute(HOSP_ID, 'general', RATING_ID, USER_ID, 'complaint')).toBeNull();
  });

  it('returns null (not a 500) on a unique-violation — an open dispute already exists for this rating', async () => {
    const uniqueViolation = Object.assign(new Error('duplicate'), { code: '23505' });
    mockQuery.mockRejectedValueOnce(uniqueViolation);
    expect(await fileDispute(HOSP_ID, 'general', RATING_ID, USER_ID, 'complaint')).toBeNull();
  });

  it('re-throws any other database error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('connection lost'));
    await expect(fileDispute(HOSP_ID, 'general', RATING_ID, USER_ID, 'complaint')).rejects.toThrow('connection lost');
  });
});

describe('listPendingDisputes / listDisputesForHospital', () => {
  it('the dev queue only returns status = pending, oldest first', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await listPendingDisputes();
    const sql = mockQuery.mock.calls[0]![0] as string;
    expect(sql).toContain(`rd.status = 'pending'`);
    expect(sql).toContain('ORDER BY rd.created_at ASC');
  });

  it('the hospital-facing list scopes to that hospital and shows every status', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await listDisputesForHospital(HOSP_ID);
    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('WHERE rd.hospital_id = $1');
    expect(sql).not.toContain(`status = 'pending'`);
    expect(params).toEqual([HOSP_ID]);
  });
});

describe('resolveDispute', () => {
  it('returns null when the dispute is not pending (already resolved) — the WHERE guards this', async () => {
    mockTxQuery.mockResolvedValueOnce({ rows: [] });
    expect(await resolveDispute(DISPUTE_ID, 'dev1', 'dismissed', null)).toBeNull();
    expect(mockTxQuery).toHaveBeenCalledTimes(1); // never reaches the recompute
  });

  it('dismissing recomputes the hospital aggregate in the same transaction', async () => {
    mockTxQuery
      .mockResolvedValueOnce({ rows: [{ hospital_id: HOSP_ID }] })
      .mockResolvedValueOnce({ rows: [{ avg: '4.00', count: '1' }] })
      .mockResolvedValueOnce({ rows: [{ avg: null, count: '0' }] })
      .mockResolvedValueOnce({ rows: [] });

    const result = await resolveDispute(DISPUTE_ID, 'dev1', 'dismissed', 'Looks legitimate');
    expect(result).toEqual({ hospital_id: HOSP_ID });
    const [updateSql, updateParams] = mockTxQuery.mock.calls[0] as [string, unknown[]];
    expect(updateSql).toContain(`SET status = $2`);
    expect(updateParams).toEqual([DISPUTE_ID, 'dismissed', 'dev1', 'Looks legitimate']);
  });

  it('upholding also recomputes — the rating stays excluded going forward', async () => {
    mockTxQuery
      .mockResolvedValueOnce({ rows: [{ hospital_id: HOSP_ID }] })
      .mockResolvedValueOnce({ rows: [{ avg: null, count: '0' }] })
      .mockResolvedValueOnce({ rows: [{ avg: null, count: '0' }] })
      .mockResolvedValueOnce({ rows: [] });

    const result = await resolveDispute(DISPUTE_ID, 'dev1', 'upheld', null);
    expect(result).toEqual({ hospital_id: HOSP_ID });
  });
});

describe('findDisputeById', () => {
  it('returns the dispute row', async () => {
    mockQueryOne.mockResolvedValueOnce({ id: DISPUTE_ID, status: 'pending' });
    expect(await findDisputeById(DISPUTE_ID)).toEqual({ id: DISPUTE_ID, status: 'pending' });
  });
});
