/**
 * Tests for the patient-facing IHN access log (planner Fix #2):
 * GET /api/biodata/access-log.
 *
 * Mirrors this project's existing isolation-test rigor (see
 * hospital-isolation.test.ts / reminders.test.ts): the single most important
 * case here is proving the route ONLY ever queries by the session's own
 * user_id, ignoring any client-supplied id, so patient A can never read
 * patient B's access history.
 */
import { GET } from '@/app/api/biodata/access-log/route';

const mockGetPatientSession = jest.fn();
const mockQuery = jest.fn();

jest.mock('next/headers', () => ({
  cookies: () => ({ get: () => ({ value: 'session-token' }) }),
}));

jest.mock('@/lib/auth', () => {
  const actual = jest.requireActual('@/lib/auth');
  return {
    ...actual,
    getPatientSession: (...a: unknown[]) => mockGetPatientSession(...a),
  };
});

jest.mock('@/lib/db', () => ({
  query: (...a: unknown[]) => mockQuery(...a),
}));

const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '22222222-2222-4222-8222-222222222222';

function session(userId: string | null) {
  mockGetPatientSession.mockResolvedValue(userId ? { user_id: userId, account_type: 'patient' } : null);
}

function req(url = 'http://localhost/api/biodata/access-log'): Request {
  return new Request(url);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockQuery.mockResolvedValue({ rows: [] });
});

describe('GET /api/biodata/access-log', () => {
  it('401 without a session', async () => {
    session(null);
    const res = await GET(req());
    expect(res.status).toBe(401);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('queries only the caller own resource id, never a client-supplied one — even if one is passed on the URL', async () => {
    session(USER_A);
    mockQuery
      .mockResolvedValueOnce({ rows: [{ count: '0' }] })
      .mockResolvedValueOnce({ rows: [] });

    // Attacker tries to smuggle a different user id via a query param that
    // this route has no parameter for at all — must be silently ignored.
    const res = await GET(req(`http://localhost/api/biodata/access-log?userId=${USER_B}&resource_id=${USER_B}`));
    expect(res.status).toBe(200);

    for (const call of mockQuery.mock.calls) {
      const [, params] = call as [string, unknown[]];
      expect(params[0]).toBe(USER_A);
      expect(params).not.toContain(USER_B);
    }
  });

  it('scopes the SQL WHERE clause to resource_type/resource_id and the two access-log action types', async () => {
    session(USER_A);
    mockQuery
      .mockResolvedValueOnce({ rows: [{ count: '0' }] })
      .mockResolvedValueOnce({ rows: [] });
    await GET(req());
    const [countSql, countParams] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(countSql).toContain("resource_type = 'biodata'");
    expect(countSql).toContain('resource_id = $1');
    expect(countParams[0]).toBe(USER_A);
    expect(countParams[1]).toEqual(['biodata_shared_read', 'rate_limited']);

    const [pageSql] = mockQuery.mock.calls[1] as [string, unknown[]];
    expect(pageSql).toContain('ORDER BY created_at DESC');
  });

  it('returns an empty-state list with total 0 when nothing has happened yet', async () => {
    session(USER_A);
    mockQuery
      .mockResolvedValueOnce({ rows: [{ count: '0' }] })
      .mockResolvedValueOnce({ rows: [] });
    const res = await GET(req());
    const body = await res.json();
    expect(body.entries).toEqual([]);
    expect(body.total).toBe(0);
  });

  it('maps a granted cross-user read: requester label, fields_returned, outcome', async () => {
    session(USER_A);
    mockQuery
      .mockResolvedValueOnce({ rows: [{ count: '1' }] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'row-1',
            action_type: 'biodata_shared_read',
            details: { requester: 'anonymous', fields_returned: ['profile_layer.full_name', 'biodata_layer.blood_group'] },
            created_at: '2026-07-30T10:00:00.000Z',
          },
        ],
      });
    const res = await GET(req());
    const body = await res.json();
    expect(body.entries).toHaveLength(1);
    expect(body.entries[0]).toMatchObject({
      requester: 'Anonymous (emergency access)',
      outcome: 'granted',
      fields_returned: ['profile_layer.full_name', 'biodata_layer.blood_group'],
    });
  });

  it('maps an authenticated-patient requester label', async () => {
    session(USER_A);
    mockQuery
      .mockResolvedValueOnce({ rows: [{ count: '1' }] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'row-2',
            action_type: 'biodata_shared_read',
            details: { requester: 'authenticated_patient', fields_returned: [] },
            created_at: '2026-07-30T10:05:00.000Z',
          },
        ],
      });
    const res = await GET(req());
    const body = await res.json();
    expect(body.entries[0].requester).toBe('Signed-in patient');
  });

  it('labels a missing/unknown requester field as Unknown rather than failing (schemaless JSONB, historical rows)', async () => {
    session(USER_A);
    mockQuery
      .mockResolvedValueOnce({ rows: [{ count: '1' }] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'row-3',
            action_type: 'biodata_shared_read',
            details: {},
            created_at: '2026-07-30T10:10:00.000Z',
          },
        ],
      });
    const res = await GET(req());
    const body = await res.json();
    expect(body.entries[0].requester).toBe('Unknown');
    expect(body.entries[0].fields_returned).toEqual([]);
  });

  it('maps a wrong-code cross-user attempt to the wrong_code outcome', async () => {
    session(USER_A);
    mockQuery
      .mockResolvedValueOnce({ rows: [{ count: '1' }] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'row-4',
            action_type: 'biodata_shared_read',
            details: { result: 'ihn_mismatch', via: 'cross_user' },
            created_at: '2026-07-30T10:15:00.000Z',
          },
        ],
      });
    const res = await GET(req());
    const body = await res.json();
    expect(body.entries[0].outcome).toBe('wrong_code');
  });

  it('maps a rate_limited row to the blocked outcome', async () => {
    session(USER_A);
    mockQuery
      .mockResolvedValueOnce({ rows: [{ count: '1' }] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'row-5',
            action_type: 'rate_limited',
            details: { endpoint: 'biodata_shared_read' },
            created_at: '2026-07-30T10:20:00.000Z',
          },
        ],
      });
    const res = await GET(req());
    const body = await res.json();
    expect(body.entries[0].outcome).toBe('blocked');
  });

  it('never includes ip_address in the response, even if the DB row somehow carries it', async () => {
    session(USER_A);
    mockQuery
      .mockResolvedValueOnce({ rows: [{ count: '1' }] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'row-6',
            action_type: 'biodata_shared_read',
            details: { requester: 'anonymous', fields_returned: [] },
            created_at: '2026-07-30T10:25:00.000Z',
            ip_address: '203.0.113.9',
          },
        ],
      });
    const res = await GET(req());
    const body = await res.json();
    expect(JSON.stringify(body)).not.toContain('203.0.113.9');
    expect(body.entries[0]).not.toHaveProperty('ip_address');
  });

  it('paginates using limit/offset from the query string and returns them back', async () => {
    session(USER_A);
    mockQuery
      .mockResolvedValueOnce({ rows: [{ count: '50' }] })
      .mockResolvedValueOnce({ rows: [] });
    const res = await GET(req('http://localhost/api/biodata/access-log?limit=5&offset=10'));
    const body = await res.json();
    expect(body.limit).toBe(5);
    expect(body.offset).toBe(10);
    const [, pageParams] = mockQuery.mock.calls[1] as [string, unknown[]];
    expect(pageParams).toEqual([USER_A, ['biodata_shared_read', 'rate_limited'], 5, 10]);
  });
});
