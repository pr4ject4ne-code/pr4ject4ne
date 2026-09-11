import { GET, POST, DELETE } from '@/app/api/dev/hospitals/[id]/association-ranking/route';

const mockGetDevUser = jest.fn();
const mockIssue = jest.fn();
const mockClear = jest.fn();
const mockList = jest.fn();
const mockLogAudit = jest.fn().mockResolvedValue(undefined);

jest.mock('@/lib/dev-auth', () => ({ getDevUser: (...a: unknown[]) => mockGetDevUser(...a) }));
jest.mock('@/lib/audit', () => ({ logAudit: (...a: unknown[]) => mockLogAudit(...a), clientIpFrom: () => null }));
jest.mock('@/lib/association-rankings', () => ({
  issueAssociationRanking: (...a: unknown[]) => mockIssue(...a),
  clearAssociationRanking: (...a: unknown[]) => mockClear(...a),
  listAssociationRankings: (...a: unknown[]) => mockList(...a),
}));

const HOSP_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function postReq(body: unknown): Request {
  return new Request(`http://localhost/api/dev/hospitals/${HOSP_ID}/association-ranking`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetDevUser.mockResolvedValue({ id: 'dev1', access_level: 'secondary' });
});

describe('GET', () => {
  it('403 without a developer session', async () => {
    mockGetDevUser.mockResolvedValue(null);
    const res = await GET(new Request('http://localhost'), { params: Promise.resolve({ id: HOSP_ID }) });
    expect(res.status).toBe(403);
  });

  it('200 for a secondary developer', async () => {
    mockList.mockResolvedValue([]);
    const res = await GET(new Request('http://localhost'), { params: Promise.resolve({ id: HOSP_ID }) });
    expect(res.status).toBe(200);
  });
});

describe('POST', () => {
  it('400 for an out-of-range score', async () => {
    const res = await POST(postReq({ score: 6, statement: 'x' }), { params: Promise.resolve({ id: HOSP_ID }) });
    expect(res.status).toBe(400);
  });

  it('400 for a missing statement — a released statement is required', async () => {
    const res = await POST(postReq({ score: 4 }), { params: Promise.resolve({ id: HOSP_ID }) });
    expect(res.status).toBe(400);
  });

  it('404 when the hospital does not exist', async () => {
    mockIssue.mockResolvedValue(null);
    const res = await POST(postReq({ score: 4, statement: 'Reviewed.' }), { params: Promise.resolve({ id: HOSP_ID }) });
    expect(res.status).toBe(404);
  });

  it('201 happy path, audit-logged', async () => {
    mockIssue.mockResolvedValue({ id: 'ar1', score: 4.5 });
    const res = await POST(postReq({ score: 4.5, statement: 'Reviewed and confirmed.' }), {
      params: Promise.resolve({ id: HOSP_ID }),
    });
    expect(res.status).toBe(201);
    expect(mockLogAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'association_ranking_issued' }));
  });
});

describe('DELETE', () => {
  it('403 without a developer session', async () => {
    mockGetDevUser.mockResolvedValue(null);
    const res = await DELETE(new Request('http://localhost'), { params: Promise.resolve({ id: HOSP_ID }) });
    expect(res.status).toBe(403);
  });

  it('200 happy path, audit-logged', async () => {
    const res = await DELETE(new Request('http://localhost'), { params: Promise.resolve({ id: HOSP_ID }) });
    expect(res.status).toBe(200);
    expect(mockClear).toHaveBeenCalledWith(HOSP_ID);
    expect(mockLogAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'association_ranking_cleared' }));
  });
});
