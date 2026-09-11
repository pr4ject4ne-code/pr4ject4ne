const mockQuery = jest.fn();
const mockTxQuery = jest.fn();

jest.mock('@/lib/db', () => ({
  query: (...a: unknown[]) => mockQuery(...a),
  withTransaction: (fn: (tx: { query: (...a: unknown[]) => unknown }) => unknown) =>
    fn({ query: (...a: unknown[]) => mockTxQuery(...a) }),
}));

import { issueAssociationRanking, clearAssociationRanking, listAssociationRankings } from '@/lib/association-rankings';

const HOSP_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const DEV_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

beforeEach(() => jest.clearAllMocks());

describe('issueAssociationRanking', () => {
  it('returns null when the statement is empty/whitespace-only — a released statement is required', async () => {
    const result = await issueAssociationRanking(HOSP_ID, DEV_ID, 4, '   ');
    expect(result).toBeNull();
    expect(mockTxQuery).not.toHaveBeenCalled();
  });

  it('returns null when the hospital does not exist', async () => {
    mockTxQuery.mockResolvedValueOnce({ rows: [] });
    const result = await issueAssociationRanking(HOSP_ID, DEV_ID, 4, 'Reviewed and confirmed.');
    expect(result).toBeNull();
    expect(mockTxQuery).toHaveBeenCalledTimes(1); // never reaches the hospitals UPDATE
  });

  it('inserts the ranking AND writes hospitals.association_score in the same transaction', async () => {
    mockTxQuery.mockResolvedValueOnce({ rows: [{ id: 'ar1' }] }).mockResolvedValueOnce({ rows: [] });
    const result = await issueAssociationRanking(HOSP_ID, DEV_ID, 4.5, 'Reviewed and confirmed.');
    expect(result).toEqual({ id: 'ar1', score: 4.5 });

    const [updateSql, updateParams] = mockTxQuery.mock.calls[1] as [string, unknown[]];
    expect(updateSql).toContain('SET association_score = $2');
    expect(updateParams).toEqual([HOSP_ID, 4.5]);
  });

  it('sanitizes the statement text', async () => {
    mockTxQuery.mockResolvedValueOnce({ rows: [{ id: 'ar1' }] }).mockResolvedValueOnce({ rows: [] });
    await issueAssociationRanking(HOSP_ID, DEV_ID, 4, '<script>bad</script> Reviewed.');
    const [, params] = mockTxQuery.mock.calls[0] as [string, unknown[]];
    expect(params[2]).not.toContain('<script>');
  });
});

describe('clearAssociationRanking', () => {
  it('sets association_score to NULL without touching the history table', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await clearAssociationRanking(HOSP_ID);
    expect(mockQuery).toHaveBeenCalledTimes(1);
    const sql = mockQuery.mock.calls[0]![0] as string;
    expect(sql).toContain('SET association_score = NULL');
    expect(sql).not.toContain('DELETE FROM association_rankings');
  });
});

describe('listAssociationRankings', () => {
  it('returns full history, most recent first', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'ar2', score: 4, statement: 'Latest', issued_by_dev_id: DEV_ID, created_at: '2026-02-01' }] });
    const result = await listAssociationRankings(HOSP_ID);
    expect(result).toHaveLength(1);
    const sql = mockQuery.mock.calls[0]![0] as string;
    expect(sql).toContain('ORDER BY created_at DESC');
  });
});
