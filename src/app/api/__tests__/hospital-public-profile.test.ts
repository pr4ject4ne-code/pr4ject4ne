/**
 * Tests for GET /api/hospitals/[id] — the public hospital profile fetch.
 * Covers worklist #10 (show_doctors): the column must be selected and passed
 * through untouched so the client can decide whether to render DoctorRoster.
 */
import { GET } from '@/app/api/hospitals/[id]/route';

const mockQueryOne = jest.fn();
const mockQuery = jest.fn();

jest.mock('@/lib/db', () => ({
  queryOne: (...a: unknown[]) => mockQueryOne(...a),
  query: (...a: unknown[]) => mockQuery(...a),
}));

const HOSP_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function req(id: string): Request {
  return new Request(`http://localhost/api/hospitals/${id}`);
}

describe('GET /api/hospitals/[id]', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQuery.mockResolvedValue({ rows: [] });
  });

  it('selects show_doctors and returns it on the hospital object', async () => {
    mockQueryOne.mockResolvedValue({ id: HOSP_ID, name: 'Test Pharmacy', show_doctors: false });

    const res = await GET(req(HOSP_ID), { params: Promise.resolve({ id: HOSP_ID }) });
    expect(res.status).toBe(200);

    const sql = mockQueryOne.mock.calls[0][0] as string;
    expect(sql).toContain('show_doctors');

    const body = await res.json();
    expect(body.hospital.show_doctors).toBe(false);
  });

  it('returns show_doctors true for a hospital with the flag on', async () => {
    mockQueryOne.mockResolvedValue({ id: HOSP_ID, name: 'Test Hospital', show_doctors: true });

    const res = await GET(req(HOSP_ID), { params: Promise.resolve({ id: HOSP_ID }) });
    const body = await res.json();
    expect(body.hospital.show_doctors).toBe(true);
  });

  it('404s for a malformed id without touching the db', async () => {
    const res = await GET(req('not-a-uuid'), { params: Promise.resolve({ id: 'not-a-uuid' }) });
    expect(res.status).toBe(404);
    expect(mockQueryOne).not.toHaveBeenCalled();
  });
});
