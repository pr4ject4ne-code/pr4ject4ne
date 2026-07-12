/**
 * Tests for POST /api/uploads (image upload endpoint).
 */
import { POST } from '@/app/api/uploads/route';

const mockGetDevUser = jest.fn();
const mockGetHospitalStaff = jest.fn();
const mockCheckRateLimit = jest.fn();
const mockIsConfigured = jest.fn();
const mockUploadImage = jest.fn();

jest.mock('@/lib/dev-auth', () => ({ getDevUser: (...a: unknown[]) => mockGetDevUser(...a) }));
jest.mock('@/lib/hospital-auth', () => ({
  getHospitalStaff: (...a: unknown[]) => mockGetHospitalStaff(...a),
}));
jest.mock('@/lib/auth', () => ({ checkRateLimit: (...a: unknown[]) => mockCheckRateLimit(...a) }));
jest.mock('@/lib/storage', () => ({
  isStorageConfigured: (...a: unknown[]) => mockIsConfigured(...a),
  uploadImage: (...a: unknown[]) => mockUploadImage(...a),
  extensionForType: (t: string) => (t === 'image/gif' ? null : t === 'image/png' ? 'png' : null),
  MAX_UPLOAD_BYTES: 5 * 1024 * 1024,
}));
jest.mock('@/lib/audit', () => ({
  logAudit: jest.fn().mockResolvedValue(undefined),
  clientIpFrom: () => null,
}));

function fileReq(file?: File): Request {
  const fd = new FormData();
  if (file) fd.set('file', file);
  return new Request('http://localhost/api/uploads', { method: 'POST', body: fd });
}
const png = (bytes = 3) => new File([new Uint8Array(bytes)], 'p.png', { type: 'image/png' });

beforeEach(() => {
  jest.clearAllMocks();
  mockGetDevUser.mockResolvedValue(null);
  mockGetHospitalStaff.mockResolvedValue(null);
  mockCheckRateLimit.mockResolvedValue(true);
  mockIsConfigured.mockReturnValue(true);
  mockUploadImage.mockResolvedValue({ url: 'https://x.supabase.co/storage/v1/object/public/media/first-aid/a.png' });
});

it('401 when not authenticated', async () => {
  const res = await POST(fileReq(png()));
  expect(res.status).toBe(401);
});

it('503 when storage is not configured', async () => {
  mockGetDevUser.mockResolvedValue({ id: 'dev1' });
  mockIsConfigured.mockReturnValue(false);
  const res = await POST(fileReq(png()));
  expect(res.status).toBe(503);
});

it('400 when no file is provided', async () => {
  mockGetDevUser.mockResolvedValue({ id: 'dev1' });
  const res = await POST(fileReq());
  expect(res.status).toBe(400);
});

it('415 for an unsupported type', async () => {
  mockGetDevUser.mockResolvedValue({ id: 'dev1' });
  const gif = new File([new Uint8Array(3)], 'x.gif', { type: 'image/gif' });
  const res = await POST(fileReq(gif));
  expect(res.status).toBe(415);
});

it('413 for a file over the size cap', async () => {
  mockGetDevUser.mockResolvedValue({ id: 'dev1' });
  const big = png(5 * 1024 * 1024 + 1);
  const res = await POST(fileReq(big));
  expect(res.status).toBe(413);
});

it('uploads a valid image and returns the URL (developer → first-aid prefix)', async () => {
  mockGetDevUser.mockResolvedValue({ id: 'dev1' });
  const res = await POST(fileReq(png()));
  expect(res.status).toBe(201);
  expect((await res.json()).url).toContain('/public/media/first-aid/');
  expect(mockUploadImage).toHaveBeenCalledWith(
    expect.objectContaining({ contentType: 'image/png', prefix: 'first-aid' }),
  );
});

it('scopes hospital-staff uploads to their hospital', async () => {
  mockGetHospitalStaff.mockResolvedValue({ userId: 'u1', hospitalId: 'hosp-9' });
  const res = await POST(fileReq(png()));
  expect(res.status).toBe(201);
  expect(mockUploadImage).toHaveBeenCalledWith(
    expect.objectContaining({ prefix: 'hospitals/hosp-9' }),
  );
});

it('429 when the upload rate limit is exceeded', async () => {
  mockGetDevUser.mockResolvedValue({ id: 'dev1' });
  mockCheckRateLimit.mockResolvedValue(false);
  const res = await POST(fileReq(png()));
  expect(res.status).toBe(429);
});
