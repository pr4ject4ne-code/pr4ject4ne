/**
 * Integration tests for developer-gated first-aid create + single-entry delete.
 */
import { POST } from '@/app/api/first-aid/entries/create/route';
import { DELETE, PATCH } from '@/app/api/first-aid/entries/[id]/route';

const mockGetDevUser = jest.fn();
const mockCheckRateLimit = jest.fn().mockResolvedValue(true);
const mockQuery = jest.fn();
const mockQueryOne = jest.fn();

jest.mock('@/lib/dev-auth', () => ({
  getDevUser: (...a: unknown[]) => mockGetDevUser(...a),
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

  it('429 when the upload rate limit is exceeded', async () => {
    mockGetDevUser.mockResolvedValue({ id: 'dev1' });
    mockCheckRateLimit.mockResolvedValueOnce(false);
    const res = await POST(createReq({ title: 'CPR', category: 'procedure' }));
    expect(res.status).toBe(429);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('normalizes signs_symptoms against the whitelist and persists it (worklist #34)', async () => {
    mockGetDevUser.mockResolvedValue({ id: 'dev1' });
    mockQuery.mockResolvedValue({ rows: [{ id: ENTRY_ID }] });
    const res = await POST(
      createReq({
        title: 'Severe Bleeding',
        category: 'procedure',
        signs_symptoms: ['Bleeding', 'NotARealTag', 'Shock', 'Bleeding'],
      }),
    );
    expect(res.status).toBe(201);
    const insertSql = mockQuery.mock.calls[0][0] as string;
    const insertArgs = mockQuery.mock.calls[0][1] as unknown[];
    expect(insertSql).toContain('signs_symptoms');
    // Whitelisted + de-duped, unknown value dropped, order-preserving.
    expect(insertArgs).toContainEqual(['Bleeding', 'Shock']);
  });
});

describe('DELETE /api/first-aid/entries/[id]', () => {
  beforeEach(() => jest.clearAllMocks());

  it('allows any developer (secondary) to delete an entry they did not create', async () => {
    // Both dev levels manage the whole catalog now — no per-entry ownership gate.
    mockGetDevUser.mockResolvedValue({ id: 'dev1', access_level: 'secondary' });
    mockQueryOne.mockResolvedValue({ id: ENTRY_ID });
    mockQuery.mockResolvedValue({ rows: [] });
    const res = await DELETE(new Request('http://localhost'), { params: Promise.resolve({ id: ENTRY_ID }) });
    expect(res.status).toBe(200);
  });

  it('404 when the entry does not exist', async () => {
    mockGetDevUser.mockResolvedValue({ id: 'dev1', access_level: 'primary' });
    mockQueryOne.mockResolvedValue(null);
    const res = await DELETE(new Request('http://localhost'), { params: Promise.resolve({ id: ENTRY_ID }) });
    expect(res.status).toBe(404);
  });

  it('429 when the edit rate limit is exceeded', async () => {
    mockGetDevUser.mockResolvedValue({ id: 'dev1', access_level: 'secondary' });
    mockCheckRateLimit.mockResolvedValueOnce(false);
    const res = await DELETE(new Request('http://localhost'), { params: Promise.resolve({ id: ENTRY_ID }) });
    expect(res.status).toBe(429);
    expect(mockQueryOne).not.toHaveBeenCalled();
    expect(mockQuery).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/first-aid/entries/[id]', () => {
  beforeEach(() => jest.clearAllMocks());

  function patchReq(body: unknown): Request {
    return new Request('http://localhost', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  it('403 when not a developer', async () => {
    mockGetDevUser.mockResolvedValue(null);
    const res = await PATCH(patchReq({ title: 'New' }), { params: Promise.resolve({ id: ENTRY_ID }) });
    expect(res.status).toBe(403);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('allows any developer (secondary) to edit an entry they did not create', async () => {
    // Both dev levels manage the whole catalog now — no per-entry ownership gate.
    mockGetDevUser.mockResolvedValue({ id: 'dev1', access_level: 'secondary' });
    mockQueryOne.mockResolvedValue({ id: ENTRY_ID });
    mockQuery.mockResolvedValue({ rows: [] });
    const res = await PATCH(patchReq({ title: 'Updated' }), { params: Promise.resolve({ id: ENTRY_ID }) });
    expect(res.status).toBe(200);
    expect(mockQuery).toHaveBeenCalled();
  });

  it('allows a primary dev to edit any entry', async () => {
    mockGetDevUser.mockResolvedValue({ id: 'dev1', access_level: 'primary' });
    mockQueryOne.mockResolvedValue({ id: ENTRY_ID });
    mockQuery.mockResolvedValue({ rows: [] });
    const res = await PATCH(patchReq({ title: 'Primary edit' }), { params: Promise.resolve({ id: ENTRY_ID }) });
    expect(res.status).toBe(200);
  });

  it('404 when editing an entry that does not exist', async () => {
    mockGetDevUser.mockResolvedValue({ id: 'dev1', access_level: 'secondary' });
    mockQueryOne.mockResolvedValue(null);
    const res = await PATCH(patchReq({ title: 'x' }), { params: Promise.resolve({ id: ENTRY_ID }) });
    expect(res.status).toBe(404);
  });

  it('429 when the edit rate limit is exceeded', async () => {
    mockGetDevUser.mockResolvedValue({ id: 'dev1', access_level: 'secondary' });
    mockCheckRateLimit.mockResolvedValueOnce(false);
    const res = await PATCH(patchReq({ title: 'x' }), { params: Promise.resolve({ id: ENTRY_ID }) });
    expect(res.status).toBe(429);
    expect(mockQueryOne).not.toHaveBeenCalled();
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('normalizes signs_symptoms on edit (worklist #34 round-trip)', async () => {
    mockGetDevUser.mockResolvedValue({ id: 'dev1', access_level: 'secondary' });
    mockQueryOne.mockResolvedValue({ id: ENTRY_ID });
    mockQuery.mockResolvedValue({ rows: [] });
    const res = await PATCH(
      patchReq({ signs_symptoms: ['Choking', 'NotReal'] }),
      { params: Promise.resolve({ id: ENTRY_ID }) },
    );
    expect(res.status).toBe(200);
    const updateSql = mockQuery.mock.calls[0][0] as string;
    const updateArgs = mockQuery.mock.calls[0][1] as unknown[];
    expect(updateSql).toContain('signs_symptoms = $');
    expect(updateArgs).toContainEqual(['Choking']);
  });
});
