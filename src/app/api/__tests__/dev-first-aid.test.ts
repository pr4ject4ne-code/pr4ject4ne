/**
 * Integration tests for developer-gated first-aid create + single-entry delete.
 */
import { POST } from '@/app/api/first-aid/entries/create/route';
import { DELETE } from '@/app/api/first-aid/entries/[id]/route';

const mockGetDevUser = jest.fn();
const mockCheckRateLimit = jest.fn().mockResolvedValue(true);
const mockQuery = jest.fn();
const mockQueryOne = jest.fn();

jest.mock('@/lib/dev-auth', () => ({
  getDevUser: (...a: unknown[]) => mockGetDevUser(...a),
  isAdmin: (u: { access_level?: string }) => u.access_level === 'admin',
}));

jest.mock('@/lib/auth', () => ({
  checkRateLimit: (...a: unknown[]) => mockCheckRateLimit(...a),
}));

jest.mock('@/lib/db', () => ({
  query: (...a: unknown[]) => mockQuery(...a),
  queryOne: (...a: unknown[]) => mockQueryOne(...a),
}));

jest.mock('@/lib/audit', () => ({
  logAudit: jest.fn().mockResolvedValue(undefined),
  clientIpFrom: () => null,
}));

const ENTRY_ID = '33333333-3333-4333-8333-333333333333';

function createReq(body: unknown): Request {
  return new Request('http://localhost/api/first-aid/entries/create', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/first-aid/entries/create', () => {
  beforeEach(() => jest.clearAllMocks());

  it('403 when not a developer', async () => {
    mockGetDevUser.mockResolvedValue(null);
    const res = await POST(createReq({ title: 'CPR', category: 'procedure' }));
    expect(res.status).toBe(403);
  });

  it('400 when title is missing', async () => {
    mockGetDevUser.mockResolvedValue({ id: 'dev1' });
    const res = await POST(createReq({ category: 'procedure' }));
    expect(res.status).toBe(400);
  });

  it('400 on invalid category', async () => {
    mockGetDevUser.mockResolvedValue({ id: 'dev1' });
    const res = await POST(createReq({ title: 'CPR', category: 'nope' }));
    expect(res.status).toBe(400);
  });

  it('creates and sanitizes text fields', async () => {
    mockGetDevUser.mockResolvedValue({ id: 'dev1' });
    mockQuery.mockResolvedValue({ rows: [{ id: ENTRY_ID }] });
    const res = await POST(
      createReq({ title: 'CPR', category: 'procedure', definition: '<b>x</b>' }),
    );
    expect(res.status).toBe(201);
    // The sanitized definition should have escaped brackets.
    const insertArgs = mockQuery.mock.calls[0][1] as string[];
    expect(insertArgs).toContain('&lt;b&gt;x&lt;/b&gt;');
  });
});

describe('DELETE /api/first-aid/entries/[id]', () => {
  beforeEach(() => jest.clearAllMocks());

  it('403 when the dev does not own the entry and is not admin', async () => {
    mockGetDevUser.mockResolvedValue({ id: 'dev1', access_level: 'first_aid_editor' });
    mockQueryOne.mockResolvedValue({ created_by_dev_id: 'other-dev' });
    const res = await DELETE(new Request('http://localhost'), { params: { id: ENTRY_ID } });
    expect(res.status).toBe(403);
  });

  it('allows admin to delete any entry', async () => {
    mockGetDevUser.mockResolvedValue({ id: 'dev1', access_level: 'admin' });
    mockQueryOne.mockResolvedValue({ created_by_dev_id: 'other-dev' });
    mockQuery.mockResolvedValue({ rows: [] });
    const res = await DELETE(new Request('http://localhost'), { params: { id: ENTRY_ID } });
    expect(res.status).toBe(200);
  });
});
