/**
 * Unit tests for src/lib/department-ratings.ts (mocked DB — real SQL
 * correctness, e.g. the EXISTS-check actually rejecting a bad department_id
 * against real Postgres, is covered by the integration suite instead).
 */
import {
  submitDepartmentRating,
  fetchDepartmentAggregates,
  fetchPatientDepartmentRatings,
  cascadeDeleteRemovedDepartmentRatings,
  checkDepartmentRatingUserRateLimit,
  checkDepartmentRatingHospitalRateLimit,
  DEPARTMENT_RATING_USER_MAX,
  DEPARTMENT_RATING_USER_WINDOW_SECONDS,
  DEPARTMENT_RATING_HOSPITAL_MAX,
  DEPARTMENT_RATING_HOSPITAL_WINDOW_SECONDS,
} from '@/lib/department-ratings';

const mockTxQuery = jest.fn();
const mockQuery = jest.fn();
const mockCheckRateLimit = jest.fn();

jest.mock('@/lib/db', () => ({
  query: (...a: unknown[]) => mockQuery(...a),
  withTransaction: (fn: (tx: { query: (...a: unknown[]) => unknown }) => unknown) =>
    fn({ query: (...a: unknown[]) => mockTxQuery(...a) }),
}));

jest.mock('@/lib/auth', () => ({
  checkRateLimit: (...a: unknown[]) => mockCheckRateLimit(...a),
}));

const HOSP_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const DEPT_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const OTHER_DEPT_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const USER_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

beforeEach(() => {
  jest.clearAllMocks();
});

describe('submitDepartmentRating', () => {
  it('rejects (returns null) when the INSERT ... WHERE EXISTS matches zero rows — bad department/hospital pair', async () => {
    // Simulates the EXISTS check failing: the department_id isn't part of
    // this hospital's departments (or the hospital isn't approved), so the
    // INSERT ... SELECT ... WHERE EXISTS(...) inserts nothing.
    mockTxQuery.mockResolvedValueOnce({ rows: [] });

    const result = await submitDepartmentRating(HOSP_ID, DEPT_ID, USER_ID, 4);

    expect(result).toBeNull();
    // Only the INSERT was attempted — no aggregate recompute on a rejected write.
    expect(mockTxQuery).toHaveBeenCalledTimes(1);
    const [sql] = mockTxQuery.mock.calls[0] as [string];
    expect(sql).toContain('WHERE EXISTS');
    expect(sql).toContain('ON CONFLICT');
  });

  it('upserts — a resubmit by the same patient/department does not duplicate, it updates', async () => {
    mockTxQuery
      .mockResolvedValueOnce({ rows: [{ id: 'rating-1' }] }) // INSERT ... ON CONFLICT DO UPDATE
      .mockResolvedValueOnce({ rows: [] }) // UPDATE hospitals aggregate write
      .mockResolvedValueOnce({ rows: [{ rating_avg: '4.00', rating_count: '1' }] }) // hospital select
      .mockResolvedValueOnce({ rows: [{ avg: '4.00', count: '1' }] }); // department select

    const first = await submitDepartmentRating(HOSP_ID, DEPT_ID, USER_ID, 4);
    expect(first).toEqual({
      department_avg: 4,
      department_count: 1,
      hospital_rating_avg: 4,
      hospital_rating_count: 1,
    });

    jest.clearAllMocks();
    mockTxQuery
      .mockResolvedValueOnce({ rows: [{ id: 'rating-1' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ rating_avg: '2.00', rating_count: '1' }] })
      .mockResolvedValueOnce({ rows: [{ avg: '2.00', count: '1' }] });

    const second = await submitDepartmentRating(HOSP_ID, DEPT_ID, USER_ID, 2);
    expect(second?.department_count).toBe(1); // still one row, updated not duplicated
    expect(second?.department_avg).toBe(2);

    // Same INSERT statement is reused for the resubmit (ON CONFLICT DO UPDATE),
    // never a second distinct insert path.
    const [sql, params] = mockTxQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('ON CONFLICT (hospital_id, department_id, patient_user_id)');
    expect(params).toEqual([HOSP_ID, DEPT_ID, USER_ID, 2]);
  });

  it('writes the hospital-level aggregate as a plain AVG/COUNT (no per-department weighting)', async () => {
    mockTxQuery
      .mockResolvedValueOnce({ rows: [{ id: 'rating-1' }] })
      .mockResolvedValueOnce({ rows: [] }) // UPDATE hospitals aggregate write (asserted on below)
      .mockResolvedValueOnce({ rows: [{ rating_avg: '3.50', rating_count: '4' }] })
      .mockResolvedValueOnce({ rows: [{ avg: '4.00', count: '2' }] });

    const result = await submitDepartmentRating(HOSP_ID, DEPT_ID, USER_ID, 4);

    // The UPDATE hospitals statement (2nd tx call) computes rating_avg/count
    // via a plain AVG(score)/COUNT(*) subquery, not a weighted sum.
    const [updateSql] = mockTxQuery.mock.calls[1] as [string];
    expect(updateSql).toContain('AVG(score)::numeric(3,2)');
    expect(updateSql).toContain('COUNT(*)');
    expect(updateSql).not.toMatch(/weight/i);

    expect(result).toEqual({
      department_avg: 4,
      department_count: 2,
      hospital_rating_avg: 3.5,
      hospital_rating_count: 4,
    });
  });
});

describe('fetchDepartmentAggregates', () => {
  it('returns a plain average/count per department, matching the fixture', async () => {
    // Fixture: department A has scores [4, 5] -> avg 4.5, count 2.
    // department B has scores [3] -> avg 3, count 1. AVG/COUNT already
    // computed DB-side (GROUP BY) — this asserts the parsing/shape only.
    mockQuery.mockResolvedValueOnce({
      rows: [
        { department_id: DEPT_ID, avg: '4.50', count: '2' },
        { department_id: OTHER_DEPT_ID, avg: '3.00', count: '1' },
      ],
    });

    const out = await fetchDepartmentAggregates(HOSP_ID);

    expect(out).toEqual({
      [DEPT_ID]: { avg: 4.5, count: 2 },
      [OTHER_DEPT_ID]: { avg: 3, count: 1 },
    });
    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('GROUP BY department_id');
    expect(params).toEqual([HOSP_ID]);
  });

  it('returns {} when the hospital has no ratings', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    expect(await fetchDepartmentAggregates(HOSP_ID)).toEqual({});
  });
});

describe('fetchPatientDepartmentRatings', () => {
  it('returns the caller own scores keyed by department_id', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        { department_id: DEPT_ID, score: 5 },
        { department_id: OTHER_DEPT_ID, score: 3 },
      ],
    });

    const out = await fetchPatientDepartmentRatings(HOSP_ID, USER_ID);

    expect(out).toEqual({ [DEPT_ID]: 5, [OTHER_DEPT_ID]: 3 });
    const [, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(params).toEqual([HOSP_ID, USER_ID]);
  });
});

describe('cascadeDeleteRemovedDepartmentRatings', () => {
  it('no-ops (no queries) when nothing was removed', async () => {
    await cascadeDeleteRemovedDepartmentRatings(HOSP_ID, [], { query: mockTxQuery });
    expect(mockTxQuery).not.toHaveBeenCalled();
  });

  it('deletes only the removed department ids and recomputes the hospital aggregate', async () => {
    mockTxQuery.mockResolvedValue({ rows: [] });

    await cascadeDeleteRemovedDepartmentRatings(HOSP_ID, [DEPT_ID], { query: mockTxQuery });

    expect(mockTxQuery).toHaveBeenCalledTimes(2);
    const [deleteSql, deleteParams] = mockTxQuery.mock.calls[0] as [string, unknown[]];
    expect(deleteSql).toContain('DELETE FROM department_ratings');
    expect(deleteParams).toEqual([HOSP_ID, [DEPT_ID]]);
    // Never touches a different department's ratings.
    expect(deleteParams[1]).not.toContain(OTHER_DEPT_ID);

    const [updateSql] = mockTxQuery.mock.calls[1] as [string];
    expect(updateSql).toContain('rating_avg = COALESCE');
    expect(updateSql).toContain('COUNT(*)');
  });
});

describe('rate limit buckets', () => {
  it('checks the per-user bucket independently with the configured max/window', async () => {
    mockCheckRateLimit.mockResolvedValue(true);
    await checkDepartmentRatingUserRateLimit(USER_ID);
    expect(mockCheckRateLimit).toHaveBeenCalledWith(
      `department_rating_user:${USER_ID}`,
      DEPARTMENT_RATING_USER_MAX,
      DEPARTMENT_RATING_USER_WINDOW_SECONDS,
    );
  });

  it('checks the per-hospital-target bucket independently with the configured max/window', async () => {
    mockCheckRateLimit.mockResolvedValue(true);
    await checkDepartmentRatingHospitalRateLimit(HOSP_ID);
    expect(mockCheckRateLimit).toHaveBeenCalledWith(
      `department_rating_hospital:${HOSP_ID}`,
      DEPARTMENT_RATING_HOSPITAL_MAX,
      DEPARTMENT_RATING_HOSPITAL_WINDOW_SECONDS,
    );
  });
});
