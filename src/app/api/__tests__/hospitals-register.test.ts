/**
 * Tests for POST /api/hospitals (public self-registration). No test file
 * existed for this route before — added while fixing a code-review finding:
 * latitude/longitude were only `typeof`-checked (accepts NaN/Infinity/any
 * out-of-range value), unlike the sibling PATCH /api/hospital/[id]/info
 * route's range-checked version. This route became reachable from a public,
 * unauthenticated form (/hospitals/register, worklist #35/#36) the same day
 * the gap was found, raising it from "API-only, low exposure" to a real
 * public-input validation gap.
 */
import { POST } from '@/app/api/hospitals/route';

const mockQuery = jest.fn();
jest.mock('@/lib/db', () => ({
  query: (...a: unknown[]) => mockQuery(...a),
}));

const mockCheckRateLimit = jest.fn();
jest.mock('@/lib/auth', () => ({
  checkRateLimit: (...a: unknown[]) => mockCheckRateLimit(...a),
}));

const mockLogAudit = jest.fn();
jest.mock('@/lib/audit', () => ({
  logAudit: (...a: unknown[]) => mockLogAudit(...a),
  clientIpFrom: () => null,
}));

const HOSP = '11111111-1111-4111-8111-111111111111';

function req(body: unknown): Request {
  return new Request('http://localhost/api/hospitals', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** Raw body text, for cases JSON.stringify can't express (e.g. `Infinity`,
 * which stringifies to `null` and would never reach the server as-is — but
 * `1e400` is valid JSON text that JS's JSON.parse overflows to Infinity, so
 * a real attacker isn't limited to what JSON.stringify(jsObject) can send). */
function rawReq(bodyText: string): Request {
  return new Request('http://localhost/api/hospitals', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: bodyText,
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockCheckRateLimit.mockResolvedValue(true);
  mockQuery.mockResolvedValue({ rows: [{ id: HOSP }] });
});

describe('POST /api/hospitals', () => {
  it('registers a hospital landing pending, with well-formed lat/lng', async () => {
    const res = await POST(req({ name: 'Test Hospital', latitude: 6.45, longitude: 7.5 }));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.status).toBe('pending');
    const [sql, values] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("'pending'");
    expect(values).toContain(6.45);
    expect(values).toContain(7.5);
  });

  it('400 without a name', async () => {
    const res = await POST(req({}));
    expect(res.status).toBe(400);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('429 when rate limited', async () => {
    mockCheckRateLimit.mockResolvedValue(false);
    const res = await POST(req({ name: 'Test Hospital' }));
    expect(res.status).toBe(429);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it.each([
    ['out of range high (99999)', 99999, 7.5],
    ['out of range low (-999)', -999, 7.5],
    ['longitude out of range (999)', 6.45, 999],
  ])('drops out-of-range lat/lng to null instead of storing garbage: %s', async (_label, lat, lng) => {
    const res = await POST(req({ name: 'Test Hospital', latitude: lat, longitude: lng }));
    expect(res.status).toBe(201);
    const [, values] = mockQuery.mock.calls[0] as [string, unknown[]];
    // latitude is values[4], longitude is values[5] per the INSERT column order.
    const [lat0, lng0] = [values[4], values[5]];
    const latIsBad = !(lat >= -90 && lat <= 90);
    const lngIsBad = !(lng >= -180 && lng <= 180);
    if (latIsBad) expect(lat0).toBeNull();
    if (lngIsBad) expect(lng0).toBeNull();
  });

  it('drops non-finite latitude (JSON 1e400 overflows to Infinity on parse) to null', async () => {
    const res = await POST(
      rawReq('{"name":"Test Hospital","latitude":1e400,"longitude":7.5}'),
    );
    expect(res.status).toBe(201);
    const [, values] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(values[4]).toBeNull();
    expect(values[5]).toBe(7.5);
  });

  it('accepts boundary-valid lat/lng (90/-180)', async () => {
    const res = await POST(req({ name: 'Test Hospital', latitude: 90, longitude: -180 }));
    expect(res.status).toBe(201);
    const [, values] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(values).toContain(90);
    expect(values).toContain(-180);
  });
});
