import { recomputeHospitalRatingAggregate } from '@/lib/hospital-rating-aggregate';

const HOSP_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function mockTx(generalAvg: string | null, generalCount: string, indepthAvg: string | null, indepthCount: string) {
  const query = jest
    .fn()
    .mockResolvedValueOnce({ rows: [{ avg: generalAvg, count: generalCount }] })
    .mockResolvedValueOnce({ rows: [{ avg: indepthAvg, count: indepthCount }] })
    .mockResolvedValueOnce({ rows: [] });
  return { query };
}

describe('recomputeHospitalRatingAggregate', () => {
  it('writes the blended combined score (item 8 formula) and the summed count', async () => {
    // general=2 (1 rating), indepth=5 (1 rating) -> combined = (2*1+5*1.8)/2.8 = 3.9285714...
    const tx = mockTx('2.000', '1', '5.000', '1');
    await recomputeHospitalRatingAggregate(HOSP_ID, tx);

    const [updateSql, updateParams] = tx.query.mock.calls[2] as [string, unknown[]];
    expect(updateSql).toContain('UPDATE hospitals SET rating_avg');
    expect(updateParams[0]).toBe(HOSP_ID);
    expect(updateParams[1] as number).toBeCloseTo(3.9285714, 5);
    expect(updateParams[2]).toBe(2); // 1 general + 1 in-depth
  });

  it('uses only the general average when there are no in-depth ratings at all', async () => {
    const tx = mockTx('4.000', '3', null, '0');
    await recomputeHospitalRatingAggregate(HOSP_ID, tx);
    const [, updateParams] = tx.query.mock.calls[2] as [string, unknown[]];
    expect(updateParams[1]).toBe(4);
    expect(updateParams[2]).toBe(3);
  });

  it('uses only the in-depth average when there are no general ratings at all', async () => {
    const tx = mockTx(null, '0', '3.500', '2');
    await recomputeHospitalRatingAggregate(HOSP_ID, tx);
    const [, updateParams] = tx.query.mock.calls[2] as [string, unknown[]];
    expect(updateParams[1]).toBe(3.5);
    expect(updateParams[2]).toBe(2);
  });

  it('writes 0 (never null/NaN) when the hospital has no ratings of either kind', async () => {
    const tx = mockTx(null, '0', null, '0');
    await recomputeHospitalRatingAggregate(HOSP_ID, tx);
    const [, updateParams] = tx.query.mock.calls[2] as [string, unknown[]];
    expect(updateParams[1]).toBe(0);
    expect(updateParams[2]).toBe(0);
  });

  it('excludes disputed ratings live via NOT EXISTS on rating_disputes, for both rating types', async () => {
    const tx = mockTx('4.000', '1', '4.000', '1');
    await recomputeHospitalRatingAggregate(HOSP_ID, tx);
    const generalSql = tx.query.mock.calls[0]![0] as string;
    const indepthSql = tx.query.mock.calls[1]![0] as string;
    expect(generalSql).toMatch(/NOT EXISTS[\s\S]*rating_disputes[\s\S]*general_rating_id/);
    expect(indepthSql).toMatch(/NOT EXISTS[\s\S]*rating_disputes[\s\S]*department_rating_id/);
    expect(generalSql).toMatch(/status IN \('pending', 'upheld'\)/);
    expect(indepthSql).toMatch(/status IN \('pending', 'upheld'\)/);
  });

  it('the in-depth average is computed as the equal-thirds composite in SQL, not a raw column average', async () => {
    const tx = mockTx(null, '0', '4.000', '1');
    await recomputeHospitalRatingAggregate(HOSP_ID, tx);
    const indepthSql = tx.query.mock.calls[1]![0] as string;
    expect(indepthSql).toContain('(d.staff_score + d.service_score + d.infrastructure_score) / 3.0');
  });

  it('both hospital_id params are scoped to the passed-in hospital, never a different one', async () => {
    const tx = mockTx('4.000', '1', '4.000', '1');
    await recomputeHospitalRatingAggregate(HOSP_ID, tx);
    expect(tx.query.mock.calls[0]![1]).toEqual([HOSP_ID]);
    expect(tx.query.mock.calls[1]![1]).toEqual([HOSP_ID]);
  });
});
