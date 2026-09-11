/**
 * Tests for GET /api/hospitals/[id]/ranking (worklist #2 — region/national
 * rating rank on the hospital profile).
 */
import { GET } from '@/app/api/hospitals/[id]/ranking/route';

const mockQueryOne = jest.fn();

jest.mock('@/lib/db', () => ({
  queryOne: (...a: unknown[]) => mockQueryOne(...a),
}));

const HOSP_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function req(id: string): Request {
  return new Request(`http://localhost/api/hospitals/${id}/ranking`);
}

describe('GET /api/hospitals/[id]/ranking', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns rank + total for region and national tiers', async () => {
    mockQueryOne.mockResolvedValue({
      rating_avg: '4.20',
      rating_count: '10',
      association_score: null,
      region_rank: '2',
      region_total: '6',
      national_rank: '3',
      national_total: '20',
    });

    const res = await GET(req(HOSP_ID), { params: Promise.resolve({ id: HOSP_ID }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      rating_avg: 4.2,
      rating_count: 10,
      association_score: null,
      region: { rank: 2, total: 6 },
      national: { rank: 3, total: 20 },
    });

    // Single query, no N+1: exactly one db call for this request.
    expect(mockQueryOne).toHaveBeenCalledTimes(1);
    const [sql, params] = mockQueryOne.mock.calls[0];
    expect(sql).toContain('PARTITION BY city');
    expect(params).toEqual([HOSP_ID]);
  });

  it('surfaces a non-null association_score when an official ranking has been issued (item 8)', async () => {
    mockQueryOne.mockResolvedValue({
      rating_avg: '3.10',
      rating_count: '40',
      association_score: '4.50',
      region_rank: '1',
      region_total: '6',
      national_rank: '1',
      national_total: '20',
    });

    const res = await GET(req(HOSP_ID), { params: Promise.resolve({ id: HOSP_ID }) });
    const body = await res.json();
    expect(body.rating_avg).toBe(3.1); // still shown, not replaced
    expect(body.association_score).toBe(4.5);
  });

  it('returns null ranking tiers for a hospital that is not approved', async () => {
    mockQueryOne.mockResolvedValue({
      rating_avg: '0',
      rating_count: '0',
      association_score: null,
      region_rank: null,
      region_total: null,
      national_rank: null,
      national_total: null,
    });

    const res = await GET(req(HOSP_ID), { params: Promise.resolve({ id: HOSP_ID }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.region).toBeNull();
    expect(body.national).toBeNull();
  });

  it('404s for a non-existent hospital id', async () => {
    mockQueryOne.mockResolvedValue(null);
    const res = await GET(req(HOSP_ID), { params: Promise.resolve({ id: HOSP_ID }) });
    expect(res.status).toBe(404);
  });

  it('404s for a malformed id without touching the db', async () => {
    const res = await GET(req('not-a-uuid'), { params: Promise.resolve({ id: 'not-a-uuid' }) });
    expect(res.status).toBe(404);
    expect(mockQueryOne).not.toHaveBeenCalled();
  });
});
