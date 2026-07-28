/**
 * Tests for dev-portal hospital creation + pending-review moderation
 * (worklist #36): GET (list, any status), POST (dev-direct-create, lands
 * approved), PATCH (approve/reject a pending hospital, optional
 * verification handoff).
 */
import { GET, POST, PATCH } from '@/app/api/dev/hospitals/route';

const mockGetDevUser = jest.fn();
const mockQuery = jest.fn();
const mockQueryOne = jest.fn();

jest.mock('@/lib/dev-auth', () => ({
  getDevUser: (...a: unknown[]) => mockGetDevUser(...a),
}));
jest.mock('@/lib/db', () => ({
  query: (...a: unknown[]) => mockQuery(...a),
  queryOne: (...a: unknown[]) => mockQueryOne(...a),
}));
jest.mock('@/lib/audit', () => ({
  logAudit: jest.fn().mockResolvedValue(undefined),
  clientIpFrom: () => null,
}));

const HOSP = '11111111-1111-4111-8111-111111111111';
const STAFF = '22222222-2222-4222-8222-222222222222';

function getReq(qs = ''): Request {
  return new Request(`http://localhost/api/dev/hospitals${qs}`);
}
function postReq(body: unknown): Request {
  return new Request('http://localhost/api/dev/hospitals', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}
function patchReq(body: unknown): Request {
  return new Request('http://localhost/api/dev/hospitals', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => jest.clearAllMocks());

describe('GET /api/dev/hospitals', () => {
  it('403 when the caller is not a developer', async () => {
    mockGetDevUser.mockResolvedValue(null);
    const res = await GET(getReq());
    expect(res.status).toBe(403);
  });

  it('lists hospitals for a developer, including pending', async () => {
    mockGetDevUser.mockResolvedValue({ id: 'dev1', access_level: 'secondary' });
    mockQuery
      .mockResolvedValueOnce({ rows: [{ count: '1' }] })
      .mockResolvedValueOnce({ rows: [{ id: HOSP, status: 'pending' }] });
    const res = await GET(getReq('?status=pending'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.hospitals).toHaveLength(1);
    const [sql] = mockQuery.mock.calls[1] as [string, unknown[]];
    expect(sql).toContain('status = $1');
  });
});

describe('POST /api/dev/hospitals', () => {
  it('403 when the caller is not a developer', async () => {
    mockGetDevUser.mockResolvedValue(null);
    const res = await POST(postReq({ name: 'Test Hospital' }));
    expect(res.status).toBe(403);
  });

  it('400 without a name', async () => {
    mockGetDevUser.mockResolvedValue({ id: 'dev1', access_level: 'secondary' });
    const res = await POST(postReq({}));
    expect(res.status).toBe(400);
  });

  it('creates a hospital landing directly approved, with lat/lng', async () => {
    mockGetDevUser.mockResolvedValue({ id: 'dev1', access_level: 'secondary' });
    mockQuery.mockResolvedValue({ rows: [{ id: HOSP }] });
    const res = await POST(
      postReq({ name: 'Test Hospital', latitude: 6.45, longitude: 7.5, service_type: 'clinic' }),
    );
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.id).toBe(HOSP);
    expect(json.status).toBe('approved');
    const [sql, values] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("'approved'");
    expect(values).toContain(6.45);
    expect(values).toContain(7.5);
  });
});

describe('PATCH /api/dev/hospitals', () => {
  it('403 when the caller is not a developer', async () => {
    mockGetDevUser.mockResolvedValue(null);
    const res = await PATCH(patchReq({ id: HOSP, action: 'approve' }));
    expect(res.status).toBe(403);
  });

  it('400 on an invalid action', async () => {
    mockGetDevUser.mockResolvedValue({ id: 'dev1', access_level: 'secondary' });
    const res = await PATCH(patchReq({ id: HOSP, action: 'delete' }));
    expect(res.status).toBe(400);
  });

  it('404 when the hospital does not exist', async () => {
    mockGetDevUser.mockResolvedValue({ id: 'dev1', access_level: 'secondary' });
    mockQueryOne.mockResolvedValue(null);
    const res = await PATCH(patchReq({ id: HOSP, action: 'approve' }));
    expect(res.status).toBe(404);
  });

  it('400 when the hospital is not pending', async () => {
    mockGetDevUser.mockResolvedValue({ id: 'dev1', access_level: 'secondary' });
    mockQueryOne.mockResolvedValue({ id: HOSP, status: 'approved' });
    const res = await PATCH(patchReq({ id: HOSP, action: 'approve' }));
    expect(res.status).toBe(400);
  });

  it('approves a pending hospital', async () => {
    mockGetDevUser.mockResolvedValue({ id: 'dev1', access_level: 'secondary' });
    mockQueryOne.mockResolvedValue({ id: HOSP, status: 'pending' });
    mockQuery.mockResolvedValue({ rowCount: 1 });
    const res = await PATCH(patchReq({ id: HOSP, action: 'approve' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe('approved');
    const [sql] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).not.toContain('account_id');
  });

  it('rejects a pending hospital', async () => {
    mockGetDevUser.mockResolvedValue({ id: 'dev1', access_level: 'secondary' });
    mockQueryOne.mockResolvedValue({ id: HOSP, status: 'pending' });
    mockQuery.mockResolvedValue({ rowCount: 1 });
    const res = await PATCH(patchReq({ id: HOSP, action: 'reject' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe('rejected');
  });

  it('400 with a malformed account_id on approve', async () => {
    mockGetDevUser.mockResolvedValue({ id: 'dev1', access_level: 'secondary' });
    mockQueryOne.mockResolvedValueOnce({ id: HOSP, status: 'pending' });
    const res = await PATCH(patchReq({ id: HOSP, action: 'approve', account_id: 'nope' }));
    expect(res.status).toBe(400);
  });

  it('400 when account_id does not belong to this hospital', async () => {
    mockGetDevUser.mockResolvedValue({ id: 'dev1', access_level: 'secondary' });
    mockQueryOne.mockResolvedValueOnce({ id: HOSP, status: 'pending' }).mockResolvedValueOnce(null);
    const res = await PATCH(patchReq({ id: HOSP, action: 'approve', account_id: STAFF }));
    expect(res.status).toBe(400);
  });

  it('approves and links a valid tertiary account, granting verified status', async () => {
    mockGetDevUser.mockResolvedValue({ id: 'dev1', access_level: 'secondary' });
    mockQueryOne
      .mockResolvedValueOnce({ id: HOSP, status: 'pending' })
      .mockResolvedValueOnce({ id: STAFF });
    mockQuery.mockResolvedValue({ rowCount: 1 });
    const res = await PATCH(patchReq({ id: HOSP, action: 'approve', account_id: STAFF }));
    expect(res.status).toBe(200);
    const [sql, values] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('account_id');
    expect(sql).toContain('verified = TRUE');
    expect(values).toContain(STAFF);
  });
});
