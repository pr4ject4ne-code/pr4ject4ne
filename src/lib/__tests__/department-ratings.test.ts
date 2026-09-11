/**
 * Unit tests for src/lib/department-ratings.ts (mocked DB — real SQL
 * correctness, e.g. the EXISTS-check actually rejecting a bad department_id
 * against real Postgres, is covered by the integration suite instead).
 *
 * Item 8 reworked this from a single `score` to a 3-axis (staff/service/
 * infrastructure) in-depth rating + optional review, and moved the
 * hospital-aggregate recompute into a shared function
 * (hospital-rating-aggregate.ts) called after every write — these tests
 * reflect that new call shape.
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

const RATING_INPUT = { staffScore: 4, serviceScore: 5, infrastructureScore: 3 };

/** The 3 calls recomputeHospitalRatingAggregate always makes: general avg,
 *  in-depth avg, then the hospitals UPDATE. */
function queueAggregateRecompute(generalAvg: string | null, indepthAvg: string | null) {
  mockTxQuery.mockResolvedValueOnce({ rows: [{ avg: generalAvg, count: '1' }] });
  mockTxQuery.mockResolvedValueOnce({ rows: [{ avg: indepthAvg, count: '1' }] });
  mockTxQuery.mockResolvedValueOnce({ rows: [] });
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('submitDepartmentRating', () => {
  it('rejects (returns null) when the INSERT ... WHERE EXISTS matches zero rows — bad department/hospital pair', async () => {
    mockTxQuery.mockResolvedValueOnce({ rows: [] });

    const result = await submitDepartmentRating(HOSP_ID, DEPT_ID, USER_ID, RATING_INPUT);

    expect(result).toBeNull();
    // Only the INSERT was attempted — no aggregate recompute on a rejected write.
    expect(mockTxQuery).toHaveBeenCalledTimes(1);
    const [sql] = mockTxQuery.mock.calls[0] as [string];
    expect(sql).toContain('WHERE EXISTS');
    expect(sql).toContain('ON CONFLICT');
    expect(sql).toContain('staff_score');
    expect(sql).toContain('service_score');
    expect(sql).toContain('infrastructure_score');
  });

  it('upserts — a resubmit by the same patient/department does not duplicate, it updates', async () => {
    mockTxQuery.mockResolvedValueOnce({ rows: [{ id: 'rating-1' }] }); // INSERT ... ON CONFLICT DO UPDATE
    queueAggregateRecompute(null, '4.00');
    mockTxQuery.mockResolvedValueOnce({ rows: [{ rating_avg: '4.00', rating_count: '1' }] });
    mockTxQuery.mockResolvedValueOnce({ rows: [{ avg: '4.00', count: '1' }] });

    const first = await submitDepartmentRating(HOSP_ID, DEPT_ID, USER_ID, RATING_INPUT);
    expect(first).toEqual({
      department_avg: 4,
      department_count: 1,
      hospital_rating_avg: 4,
      hospital_rating_count: 1,
    });

    // Same INSERT statement is reused for the resubmit (ON CONFLICT DO UPDATE).
    const [sql, params] = mockTxQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('ON CONFLICT (hospital_id, department_id, patient_user_id)');
    expect(params).toEqual([HOSP_ID, DEPT_ID, USER_ID, 4, 5, 3, null]);
  });

  it('sanitizes the review text and passes it through to the insert', async () => {
    mockTxQuery.mockResolvedValueOnce({ rows: [{ id: 'rating-1' }] });
    queueAggregateRecompute(null, '4.00');
    mockTxQuery.mockResolvedValueOnce({ rows: [{ rating_avg: '4.00', rating_count: '1' }] });
    mockTxQuery.mockResolvedValueOnce({ rows: [{ avg: '4.00', count: '1' }] });

    await submitDepartmentRating(HOSP_ID, DEPT_ID, USER_ID, { ...RATING_INPUT, review: 'Great <script> staff' });

    const [, params] = mockTxQuery.mock.calls[0] as [string, unknown[]];
    expect(params[6]).not.toContain('<script>');
  });

  it('calls the shared aggregate recompute (not a bespoke plain AVG) after a successful write', async () => {
    mockTxQuery.mockResolvedValueOnce({ rows: [{ id: 'rating-1' }] });
    queueAggregateRecompute('2.00', '4.00');
    mockTxQuery.mockResolvedValueOnce({ rows: [{ rating_avg: '3.43', rating_count: '2' }] });
    mockTxQuery.mockResolvedValueOnce({ rows: [{ avg: '4.00', count: '1' }] });

    const result = await submitDepartmentRating(HOSP_ID, DEPT_ID, USER_ID, RATING_INPUT);

    // calls[1] and calls[2] are recomputeHospitalRatingAggregate's own two
    // SELECTs (general avg, then in-depth avg); calls[3] is its UPDATE.
    expect(mockTxQuery.mock.calls[1]![0]).toContain('FROM general_ratings');
    expect(mockTxQuery.mock.calls[2]![0]).toContain('FROM department_ratings');
    expect(mockTxQuery.mock.calls[2]![0]).toContain('staff_score + d.service_score + d.infrastructure_score');
    expect(mockTxQuery.mock.calls[3]![0]).toContain('UPDATE hospitals');

    expect(result?.hospital_rating_avg).toBe(3.43);
    expect(result?.hospital_rating_count).toBe(2);
  });
});

describe('fetchDepartmentAggregates', () => {
  it('returns the composite avg plus each individual axis average, matching the fixture', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        { department_id: DEPT_ID, avg: '4.50', count: '2', staff_avg: '4.00', service_avg: '5.00', infrastructure_avg: '4.50' },
        { department_id: OTHER_DEPT_ID, avg: '3.00', count: '1', staff_avg: '3.00', service_avg: '3.00', infrastructure_avg: '3.00' },
      ],
    });

    const out = await fetchDepartmentAggregates(HOSP_ID);

    expect(out).toEqual({
      [DEPT_ID]: { avg: 4.5, count: 2, staff_avg: 4, service_avg: 5, infrastructure_avg: 4.5 },
      [OTHER_DEPT_ID]: { avg: 3, count: 1, staff_avg: 3, service_avg: 3, infrastructure_avg: 3 },
    });
    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('GROUP BY d.department_id');
    // Disputed ratings are excluded live, never via a cached flag (item 8).
    expect(sql).toMatch(/NOT EXISTS[\s\S]*rating_disputes/);
    expect(params).toEqual([HOSP_ID]);
  });

  it('returns {} when the hospital has no (non-disputed) ratings', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    expect(await fetchDepartmentAggregates(HOSP_ID)).toEqual({});
  });
});

describe('fetchPatientDepartmentRatings', () => {
  it('returns the caller\'s own 3-axis scores + review, keyed by department_id', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        { id: 'r1', department_id: DEPT_ID, staff_score: 5, service_score: 4, infrastructure_score: 3, review: 'Good' },
        { id: 'r2', department_id: OTHER_DEPT_ID, staff_score: 3, service_score: 3, infrastructure_score: 3, review: null },
      ],
    });

    const out = await fetchPatientDepartmentRatings(HOSP_ID, USER_ID);

    expect(out).toEqual({
      [DEPT_ID]: { id: 'r1', staff_score: 5, service_score: 4, infrastructure_score: 3, review: 'Good' },
      [OTHER_DEPT_ID]: { id: 'r2', staff_score: 3, service_score: 3, infrastructure_score: 3, review: null },
    });
    const [, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(params).toEqual([HOSP_ID, USER_ID]);
  });
});

describe('cascadeDeleteRemovedDepartmentRatings', () => {
  it('no-ops (no queries) when nothing was removed', async () => {
    await cascadeDeleteRemovedDepartmentRatings(HOSP_ID, [], { query: mockTxQuery });
    expect(mockTxQuery).not.toHaveBeenCalled();
  });

  it('deletes only the removed department ids, then recomputes the shared aggregate', async () => {
    mockTxQuery.mockResolvedValueOnce({ rows: [] }); // DELETE
    queueAggregateRecompute(null, null); // recompute's 3 internal calls

    await cascadeDeleteRemovedDepartmentRatings(HOSP_ID, [DEPT_ID], { query: mockTxQuery });

    expect(mockTxQuery).toHaveBeenCalledTimes(4);
    const [deleteSql, deleteParams] = mockTxQuery.mock.calls[0] as [string, unknown[]];
    expect(deleteSql).toContain('DELETE FROM department_ratings');
    expect(deleteParams).toEqual([HOSP_ID, [DEPT_ID]]);
    expect(deleteParams[1]).not.toContain(OTHER_DEPT_ID);

    // The 4th call is recomputeHospitalRatingAggregate's UPDATE.
    expect(mockTxQuery.mock.calls[3]![0]).toContain('UPDATE hospitals');
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
