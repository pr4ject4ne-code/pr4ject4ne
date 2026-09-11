import { departmentRatingComposite, combinedHospitalScore, effectiveHospitalScore } from '@/lib/rating-scoring';

describe('departmentRatingComposite', () => {
  it('averages the three axes equally', () => {
    expect(departmentRatingComposite(3, 3, 3)).toBe(3);
    expect(departmentRatingComposite(5, 4, 3)).toBe(4);
  });
  it('is order-independent (equal weighting, not e.g. staff-first)', () => {
    expect(departmentRatingComposite(5, 1, 3)).toBe(departmentRatingComposite(1, 3, 5));
  });
});

describe('combinedHospitalScore', () => {
  it('returns null when there are no ratings of either kind at all', () => {
    expect(combinedHospitalScore(null, null)).toBeNull();
  });

  it('returns the general average alone when there is no in-depth rating yet', () => {
    expect(combinedHospitalScore(4, null)).toBe(4);
  });

  it('returns the in-depth average alone when there is no general rating yet', () => {
    expect(combinedHospitalScore(null, 4)).toBe(4);
  });

  it('blends with in-depth weighted 1.8x general, per the confirmed formula', () => {
    // general=2, indepth=5 -> (2*1 + 5*1.8) / 2.8 = (2 + 9) / 2.8 = 3.9285714...
    expect(combinedHospitalScore(2, 5)).toBeCloseTo(3.9285714, 5);
  });

  it('equal general and in-depth averages blend to that same value (sanity check)', () => {
    expect(combinedHospitalScore(4, 4)).toBeCloseTo(4, 5);
  });

  it('in-depth moves the combined score more than general does, given equal-sized changes (proves the 1.8x weighting is actually applied)', () => {
    const baseline = combinedHospitalScore(3, 3)!;
    const generalUp = combinedHospitalScore(4, 3)! - baseline;
    const indepthUp = combinedHospitalScore(3, 4)! - baseline;
    expect(indepthUp).toBeGreaterThan(generalUp);
    expect(indepthUp / generalUp).toBeCloseTo(1.8, 5);
  });
});

describe('effectiveHospitalScore', () => {
  it('uses the community combined score when there is no association ranking', () => {
    expect(effectiveHospitalScore(null, 3.5)).toBe(3.5);
  });
  it('overrides with the association score when one exists, even if lower', () => {
    expect(effectiveHospitalScore(2, 4.5)).toBe(2);
  });
  it('returns null when neither exists (genuinely unrated hospital)', () => {
    expect(effectiveHospitalScore(null, null)).toBeNull();
  });
});
