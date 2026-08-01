/**
 * Tests for GET /api/first-aid/entries — the public catalog search. Exercises
 * the real ILIKE/parameter construction rather than just the client-side
 * query-string builder (see lib/first-aid-search.ts), because commit 05680ce
 * fixed a real bug where dos/donts/implications were silently missing from the
 * ILIKE list for a long time before being caught manually. These assertions are
 * specifically designed to catch a future column being dropped from the search.
 */
import { GET } from '@/app/api/first-aid/entries/route';

const mockQuery = jest.fn();

jest.mock('@/lib/db', () => ({
  query: (...a: unknown[]) => mockQuery(...a),
}));

/** All text columns the multi-column ILIKE search must cover. */
const SEARCHED_COLUMNS = [
  'title',
  'definition',
  'description',
  'process',
  'dos',
  'donts',
  'implications',
  'indication',
  'contraindications',
  'things_to_look_out_for',
];

function req(query = ''): Request {
  return new Request(`http://localhost/api/first-aid/entries${query ? `?${query}` : ''}`);
}

describe('GET /api/first-aid/entries', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes('count(*)')) return Promise.resolve({ rows: [{ count: '0' }] });
      return Promise.resolve({ rows: [] });
    });
  });

  it('searches every substantive text column (and tags) when q is given', async () => {
    const res = await GET(req('q=bleeding'));
    expect(res.status).toBe(200);

    // Both the count query and the page query build the same WHERE clause —
    // check every call for the searched columns so a future column removal
    // from the ILIKE list is caught regardless of which query changed.
    const allSql = mockQuery.mock.calls.map((call) => call[0] as string).join('\n');
    for (const col of SEARCHED_COLUMNS) {
      expect(allSql).toMatch(new RegExp(`${col} ILIKE \\$\\d+`));
    }
    // The tags/region_tags/system_tags arrays are folded into the search via
    // array_to_string, not a bare ILIKE on the column itself.
    expect(allSql).toMatch(/array_to_string\(tags, ' '\) ILIKE \$\d+/);
    expect(allSql).toMatch(/array_to_string\(region_tags, ' '\) ILIKE \$\d+/);
    expect(allSql).toMatch(/array_to_string\(system_tags, ' '\) ILIKE \$\d+/);

    // The escaped search term is passed as a bound parameter, not interpolated.
    const pageCallParams = mockQuery.mock.calls[1][1] as unknown[];
    expect(pageCallParams).toContain('%bleeding%');
  });

  it('filters by a whitelisted tag using the GIN containment operator', async () => {
    const res = await GET(req('tag=Bleeding'));
    expect(res.status).toBe(200);

    const pageCall = mockQuery.mock.calls[1];
    const sql = pageCall[0] as string;
    const params = pageCall[1] as unknown[];
    expect(sql).toMatch(/tags @> \$\d+::text\[\]/);
    expect(params).toContainEqual(['Bleeding']);
  });

  it('ignores an unrecognised tag value (not in the whitelist)', async () => {
    const res = await GET(req('tag=NotARealTag'));
    expect(res.status).toBe(200);
    const sql = mockQuery.mock.calls[1][0] as string;
    expect(sql).not.toMatch(/tags @>/);
  });

  it('filters by a whitelisted region using the GIN containment operator', async () => {
    const res = await GET(req('region=Chest'));
    expect(res.status).toBe(200);

    const pageCall = mockQuery.mock.calls[1];
    const sql = pageCall[0] as string;
    const params = pageCall[1] as unknown[];
    expect(sql).toMatch(/region_tags @> \$\d+::text\[\]/);
    expect(params).toContainEqual(['Chest']);
  });

  it('ignores an unrecognised region value (not in the whitelist)', async () => {
    const res = await GET(req('region=NotARealRegion'));
    expect(res.status).toBe(200);
    const sql = mockQuery.mock.calls[1][0] as string;
    expect(sql).not.toMatch(/region_tags @>/);
  });

  it('filters by a whitelisted system using the GIN containment operator', async () => {
    const res = await GET(req('system=Cardiovascular'));
    expect(res.status).toBe(200);

    const pageCall = mockQuery.mock.calls[1];
    const sql = pageCall[0] as string;
    const params = pageCall[1] as unknown[];
    expect(sql).toMatch(/system_tags @> \$\d+::text\[\]/);
    expect(params).toContainEqual(['Cardiovascular']);
  });

  it('ignores an unrecognised system value (not in the whitelist)', async () => {
    const res = await GET(req('system=NotARealSystem'));
    expect(res.status).toBe(200);
    const sql = mockQuery.mock.calls[1][0] as string;
    expect(sql).not.toMatch(/system_tags @>/);
  });

  it('filters by category when it is a valid category', async () => {
    await GET(req('category=procedure'));
    const sql = mockQuery.mock.calls[1][0] as string;
    const params = mockQuery.mock.calls[1][1] as unknown[];
    expect(sql).toContain('category = $1');
    expect(params).toContain('procedure');
  });

  it('ignores an invalid category value', async () => {
    await GET(req('category=nonsense'));
    const sql = mockQuery.mock.calls[1][0] as string;
    expect(sql).not.toContain('category =');
  });

  it('respects limit and offset query params', async () => {
    await GET(req('limit=5&offset=10'));
    const pageCall = mockQuery.mock.calls[1];
    const params = pageCall[1] as unknown[];
    // limit/offset are always the trailing two bound params.
    expect(params.slice(-2)).toEqual([5, 10]);
  });

  it('falls back to default pagination when limit/offset are absent', async () => {
    await GET(req());
    const params = mockQuery.mock.calls[1][1] as unknown[];
    expect(params.slice(-2)).toEqual([20, 0]);
  });

  it('returns entries, total, limit, and offset in the response body', async () => {
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes('count(*)')) return Promise.resolve({ rows: [{ count: '3' }] });
      return Promise.resolve({
        rows: [{ id: '1', title: 'CPR' }],
      });
    });
    const res = await GET(req('limit=1&offset=0'));
    const json = await res.json();
    expect(json.total).toBe(3);
    expect(json.limit).toBe(1);
    expect(json.offset).toBe(0);
    expect(json.entries).toEqual([{ id: '1', title: 'CPR' }]);
  });

  it('runs with no filters at all when no query params are given', async () => {
    await GET(req());
    const sql = mockQuery.mock.calls[1][0] as string;
    expect(sql).not.toContain('WHERE');
  });

  it('selects signs_symptoms so the public catalog can render it (worklist #34)', async () => {
    await GET(req());
    const sql = mockQuery.mock.calls[1][0] as string;
    expect(sql).toContain('signs_symptoms');
  });

  it('selects region_tags and system_tags so the public catalog can render/filter by them', async () => {
    await GET(req());
    const sql = mockQuery.mock.calls[1][0] as string;
    expect(sql).toContain('region_tags');
    expect(sql).toContain('system_tags');
  });
});
