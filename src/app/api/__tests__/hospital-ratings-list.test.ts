import { GET } from '@/app/api/hospital/[id]/ratings/route';

const mockRequireHospitalOwnership = jest.fn();
const mockQuery = jest.fn();

jest.mock('@/lib/hospital-auth', () => ({
  requireHospitalOwnership: (...a: unknown[]) => mockRequireHospitalOwnership(...a),
}));
jest.mock('@/lib/db', () => ({ query: (...a: unknown[]) => mockQuery(...a) }));

const HOSP_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

beforeEach(() => jest.clearAllMocks());

describe('GET /api/hospital/[id]/ratings', () => {
  it('403 when not this hospital\'s own staff', async () => {
    mockRequireHospitalOwnership.mockResolvedValue(null);
    const res = await GET(new Request('http://localhost'), { params: Promise.resolve({ id: HOSP_ID }) });
    expect(res.status).toBe(403);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('returns both general and department rows, each carrying a live dispute_status', async () => {
    mockRequireHospitalOwnership.mockResolvedValue({ userId: 'staff1', hospitalId: HOSP_ID });
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 'g1', score: 5, review: 'Great', dispute_status: null }] })
      .mockResolvedValueOnce({
        rows: [{ id: 'd1', department_id: 'dept1', department_name: 'Surgery', staff_score: 5, dispute_status: 'pending' }],
      });

    const res = await GET(new Request('http://localhost'), { params: Promise.resolve({ id: HOSP_ID }) });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.general).toHaveLength(1);
    expect(json.department).toHaveLength(1);
    expect(json.department[0].dispute_status).toBe('pending');
  });

  it('resolves the department name from the hospital\'s departments JSONB, not just the raw id', async () => {
    mockRequireHospitalOwnership.mockResolvedValue({ userId: 'staff1', hospitalId: HOSP_ID });
    mockQuery.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] });
    await GET(new Request('http://localhost'), { params: Promise.resolve({ id: HOSP_ID }) });
    const departmentSql = mockQuery.mock.calls[1]![0] as string;
    expect(departmentSql).toContain('department_name');
    expect(departmentSql).toContain("elem ->> 'name'");
  });
});
