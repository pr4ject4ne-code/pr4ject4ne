import { RANKING_QUERY, toHospitalRanking } from '@/lib/hospital-ranking';

describe('hospital-ranking', () => {
  describe('RANKING_QUERY', () => {
    it('partitions region rank by city and computes a national rank with no partition', () => {
      expect(RANKING_QUERY).toContain('PARTITION BY city');
      expect(RANKING_QUERY).toContain("WHERE status = 'approved'");
    });

    it('orders by the effective score — an association ranking overrides the community rating_avg for WHERE a hospital ranks (item 8)', () => {
      expect(RANKING_QUERY).toContain('ORDER BY COALESCE(association_score, rating_avg) DESC, rating_count DESC, name ASC');
      // Both region and national tiers use the same effective-score ordering.
      const occurrences = RANKING_QUERY.split('COALESCE(association_score, rating_avg) DESC').length - 1;
      expect(occurrences).toBe(2);
    });

    it('still selects the raw rating_avg and association_score separately, for transparency', () => {
      expect(RANKING_QUERY).toContain('h.rating_avg');
      expect(RANKING_QUERY).toContain('h.association_score');
    });
  });

  describe('toHospitalRanking', () => {
    it('converts a fully-ranked row (approved hospital with peers) to numbers', () => {
      const ranking = toHospitalRanking({
        rating_avg: '4.50',
        rating_count: '12',
        association_score: null,
        region_rank: '2',
        region_total: '9',
        national_rank: '5',
        national_total: '48',
      });
      expect(ranking).toEqual({
        rating_avg: 4.5,
        rating_count: 12,
        association_score: null,
        region: { rank: 2, total: 9 },
        national: { rank: 5, total: 48 },
      });
    });

    it('returns null region/national when the hospital is not approved (no ranking row joined)', () => {
      const ranking = toHospitalRanking({
        rating_avg: '0',
        rating_count: '0',
        association_score: null,
        region_rank: null,
        region_total: null,
        national_rank: null,
        national_total: null,
      });
      expect(ranking.region).toBeNull();
      expect(ranking.national).toBeNull();
      expect(ranking.rating_avg).toBe(0);
      expect(ranking.rating_count).toBe(0);
    });

    it('handles a sole hospital in its city (rank 1 of 1)', () => {
      const ranking = toHospitalRanking({
        rating_avg: '3.00',
        rating_count: '1',
        association_score: null,
        region_rank: '1',
        region_total: '1',
        national_rank: '1',
        national_total: '1',
      });
      expect(ranking.region).toEqual({ rank: 1, total: 1 });
      expect(ranking.national).toEqual({ rank: 1, total: 1 });
    });

    it('accepts numeric (already-typed) inputs, not just pg numeric strings', () => {
      const ranking = toHospitalRanking({
        rating_avg: 4,
        rating_count: 3,
        association_score: null,
        region_rank: 1,
        region_total: 3,
        national_rank: 10,
        national_total: 48,
      });
      expect(ranking).toEqual({
        rating_avg: 4,
        rating_count: 3,
        association_score: null,
        region: { rank: 1, total: 3 },
        national: { rank: 10, total: 48 },
      });
    });

    it('surfaces a non-null association_score alongside the still-present community rating_avg (item 8 — both shown, never one replacing the other in the response)', () => {
      const ranking = toHospitalRanking({
        rating_avg: '3.20',
        rating_count: '40',
        association_score: '4.50',
        region_rank: '1',
        region_total: '9',
        national_rank: '1',
        national_total: '48',
      });
      expect(ranking.rating_avg).toBe(3.2);
      expect(ranking.association_score).toBe(4.5);
    });
  });
});
