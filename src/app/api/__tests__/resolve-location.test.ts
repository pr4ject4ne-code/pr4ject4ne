const mockGetDevUser = jest.fn();
const mockGetHospitalStaff = jest.fn();
const mockCheckRateLimit = jest.fn().mockResolvedValue(true);
const mockGeocode = jest.fn();

jest.mock('@/lib/dev-auth', () => ({ getDevUser: (...a: unknown[]) => mockGetDevUser(...a) }));
jest.mock('@/lib/hospital-auth', () => ({ getHospitalStaff: (...a: unknown[]) => mockGetHospitalStaff(...a) }));
jest.mock('@/lib/auth', () => ({ checkRateLimit: (...a: unknown[]) => mockCheckRateLimit(...a) }));
jest.mock('@/lib/map', () => {
  const actual = jest.requireActual('@/lib/map');
  return { ...actual, geocode: (...a: unknown[]) => mockGeocode(...a) };
});

import { POST } from '@/app/api/resolve-location/route';

function req(body: unknown): Request {
  return new Request('http://localhost/api/resolve-location', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockCheckRateLimit.mockResolvedValue(true);
  mockGetDevUser.mockResolvedValue(null);
  mockGetHospitalStaff.mockResolvedValue(null);
});

describe('POST /api/resolve-location (item 5)', () => {
  it('401 when neither a dev nor hospital staff session exists', async () => {
    const res = await POST(req({ input: 'x' }));
    expect(res.status).toBe(401);
  });

  it('authenticated as a dev: resolves a Google Maps URL with embedded coordinates, no network call needed', async () => {
    mockGetDevUser.mockResolvedValue({ id: 'dev1' });
    const res = await POST(req({ input: 'https://www.google.com/maps/@6.4531,3.3958,15z' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({ lat: 6.4531, lng: 3.3958, source: 'url' });
    expect(mockGeocode).not.toHaveBeenCalled();
  });

  it('authenticated as hospital staff (no dev session): also works', async () => {
    mockGetHospitalStaff.mockResolvedValue({ userId: 'u1', hospitalId: 'h1' });
    const res = await POST(req({ input: 'https://www.google.com/maps/@6.4531,3.3958,15z' }));
    expect(res.status).toBe(200);
  });

  it('429 when rate-limited', async () => {
    mockGetDevUser.mockResolvedValue({ id: 'dev1' });
    mockCheckRateLimit.mockResolvedValue(false);
    const res = await POST(req({ input: 'https://www.google.com/maps/@6.4531,3.3958,15z' }));
    expect(res.status).toBe(429);
  });

  it('400 with no input', async () => {
    mockGetDevUser.mockResolvedValue({ id: 'dev1' });
    const res = await POST(req({}));
    expect(res.status).toBe(400);
  });

  it('422 for a non-Google-Maps URL — refuses to server-side-fetch an arbitrary host', async () => {
    mockGetDevUser.mockResolvedValue({ id: 'dev1' });
    const res = await POST(req({ input: 'https://evil.example.com/redirect-me' }));
    expect(res.status).toBe(422);
    expect(global.fetch).not.toHaveBeenCalled;
  });

  it('plain text input falls through to geocode()', async () => {
    mockGetDevUser.mockResolvedValue({ id: 'dev1' });
    mockGeocode.mockResolvedValue({ lat: 6.45, lng: 7.5 });
    const res = await POST(req({ input: '12 Independence Layout, Enugu' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({ lat: 6.45, lng: 7.5, source: 'geocode' });
    expect(mockGeocode).toHaveBeenCalledWith('12 Independence Layout, Enugu');
  });

  it('422 when geocode() cannot resolve the address', async () => {
    mockGetDevUser.mockResolvedValue({ id: 'dev1' });
    mockGeocode.mockResolvedValue(null);
    const res = await POST(req({ input: 'not a real place at all xyz' }));
    expect(res.status).toBe(422);
  });

  it('a shortened Google Maps link follows the redirect and re-parses the final URL', async () => {
    mockGetDevUser.mockResolvedValue({ id: 'dev1' });
    const fetchMock = jest.fn().mockResolvedValue({
      url: 'https://www.google.com/maps/place/Some+Place/@6.46,3.40,17z/data=!3d6.4602!4d3.4001',
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    const res = await POST(req({ input: 'https://maps.app.goo.gl/AbC123' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({ lat: 6.4602, lng: 3.4001, source: 'url_redirect' });
  });

  it('422 when a shortened link\'s redirect target has no parseable coordinates', async () => {
    mockGetDevUser.mockResolvedValue({ id: 'dev1' });
    const fetchMock = jest.fn().mockResolvedValue({ url: 'https://www.google.com/maps/place/Some+Place' });
    global.fetch = fetchMock as unknown as typeof fetch;
    const res = await POST(req({ input: 'https://maps.app.goo.gl/AbC123' }));
    expect(res.status).toBe(422);
  });
});
