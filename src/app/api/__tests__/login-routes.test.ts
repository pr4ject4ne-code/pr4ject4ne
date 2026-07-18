/**
 * Auth tests for the unified login entry (/api/auth/login — routes every account
 * type by setting the matching cookie) plus the legacy segregated portals that
 * remain for API clients: developer (/api/dev/login) and hospital
 * (/api/hospital/login).
 *
 * Focus: no user-enumeration (unknown email vs wrong password give the same 401),
 * correct per-type routing from the unified entry, cross-portal rejection on the
 * legacy portals, inactive/misconfigured accounts, the rate-limit branch, and that
 * a login_failed audit event fires on every failure. We mock the @/lib/auth
 * boundary (findUserByEmail / verifyPassword / createSession / checkLoginRateLimit) and
 * the audit boundary; cookies() is stubbed to a plain settable object.
 */
import { POST as patientLogin } from '@/app/api/auth/login/route';
import { POST as devLogin } from '@/app/api/dev/login/route';
import { POST as hospitalLogin } from '@/app/api/hospital/login/route';

const mockFindUserByEmail = jest.fn();
const mockVerifyPassword = jest.fn();
const mockCreateSession = jest.fn();
const mockCheckRateLimit = jest.fn();
const mockLogAudit = jest.fn().mockResolvedValue(undefined);

jest.mock('next/headers', () => ({
  cookies: () => ({ set: jest.fn(), get: () => undefined, delete: jest.fn() }),
}));

jest.mock('@/lib/auth', () => {
  const actual = jest.requireActual('@/lib/auth');
  return {
    ...actual,
    findUserByEmail: (...a: unknown[]) => mockFindUserByEmail(...a),
    verifyPassword: (...a: unknown[]) => mockVerifyPassword(...a),
    createSession: (...a: unknown[]) => mockCreateSession(...a),
    // All three login routes gate on the shared checkLoginRateLimit (one bucket per
    // email across every login endpoint); mock it directly since its internal call
    // to checkRateLimit doesn't go through the module export.
    checkLoginRateLimit: (...a: unknown[]) => mockCheckRateLimit(...a),
  };
});

jest.mock('@/lib/db', () => ({
  query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
  queryOne: jest.fn(),
}));

jest.mock('@/lib/audit', () => ({
  logAudit: (...a: unknown[]) => mockLogAudit(...a),
  clientIpFrom: () => '203.0.113.5',
}));

function loginReq(url: string, body: unknown): Request {
  return new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const CREDS = { email: 'user@test.com', password: 'SecurePass123!' };

function activeUser(overrides: Record<string, unknown>) {
  return {
    id: 'user-1',
    email: 'user@test.com',
    password_hash: 'hash',
    is_active: true,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockCheckRateLimit.mockResolvedValue(true);
  mockCreateSession.mockResolvedValue({ token: 'tok', expiresAt: new Date(Date.now() + 60000) });
});

/** A failure response must be the generic 401 with no enumeration leak. */
function expectGeneric401(status: number, code: string) {
  expect(status).toBe(401);
  expect(code).toBe('INVALID_CREDENTIALS');
}

describe('POST /api/auth/login (unified entry)', () => {
  const req = () => loginReq('http://localhost/api/auth/login', CREDS);

  it('401 (generic) for an unknown email — no enumeration', async () => {
    mockFindUserByEmail.mockResolvedValue(null);
    const res = await patientLogin(req());
    const json = await res.json();
    expectGeneric401(res.status, json.code);
    // Timing equalization: bcrypt still runs on the miss path (against a dummy
    // hash) so an unknown email costs the same as a real one — no enumeration.
    expect(mockVerifyPassword).toHaveBeenCalledWith(CREDS.password, expect.stringMatching(/^\$2/));
    expect(mockCreateSession).not.toHaveBeenCalled();
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'login_failed' }),
    );
  });

  it('401 (generic) for a wrong password — identical to unknown email', async () => {
    mockFindUserByEmail.mockResolvedValue(activeUser({ account_type: 'patient' }));
    mockVerifyPassword.mockResolvedValue(false);
    const res = await patientLogin(req());
    const json = await res.json();
    expectGeneric401(res.status, json.code);
    expect(json.error).toBe('Invalid email or password.');
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'login_failed' }),
    );
  });

  it('logs a patient in and routes to the dashboard', async () => {
    mockFindUserByEmail.mockResolvedValue(activeUser({ account_type: 'patient', hospital_id: null }));
    mockVerifyPassword.mockResolvedValue(true);
    const res = await patientLogin(req());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.account_type).toBe('patient');
    expect(json.redirect).toBe('/dashboard');
    expect(mockCreateSession).toHaveBeenCalledWith('user-1', 'patient');
    expect(mockLogAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'login' }));
  });

  it('logs a developer in and routes to the dev portal (unified entry)', async () => {
    mockFindUserByEmail.mockResolvedValue(
      activeUser({ account_type: 'developer', hospital_id: null, access_level: 'primary' }),
    );
    mockVerifyPassword.mockResolvedValue(true);
    const res = await patientLogin(req());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.account_type).toBe('developer');
    expect(json.access_level).toBe('primary');
    expect(json.redirect).toBe('/dev/dashboard');
    expect(mockCreateSession).toHaveBeenCalledWith('user-1', 'developer');
  });

  it('logs hospital staff in and routes to the institution portal', async () => {
    mockFindUserByEmail.mockResolvedValue(
      activeUser({ account_type: 'hospital_staff', hospital_id: 'hosp-1' }),
    );
    mockVerifyPassword.mockResolvedValue(true);
    const res = await patientLogin(req());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.account_type).toBe('hospital_staff');
    expect(json.redirect).toBe('/hospital/dashboard');
    expect(mockCreateSession).toHaveBeenCalledWith('user-1', 'hospital_staff');
  });

  it('401 for hospital staff with no linked hospital', async () => {
    mockFindUserByEmail.mockResolvedValue(
      activeUser({ account_type: 'hospital_staff', hospital_id: null }),
    );
    mockVerifyPassword.mockResolvedValue(true);
    const res = await patientLogin(req());
    expectGeneric401(res.status, (await res.json()).code);
    expect(mockCreateSession).not.toHaveBeenCalled();
  });

  it('401 for an inactive account', async () => {
    mockFindUserByEmail.mockResolvedValue(activeUser({ account_type: 'patient', is_active: false }));
    mockVerifyPassword.mockResolvedValue(true);
    const res = await patientLogin(req());
    expectGeneric401(res.status, (await res.json()).code);
    expect(mockCreateSession).not.toHaveBeenCalled();
  });

  it('429 when rate-limited (before any DB lookup)', async () => {
    mockCheckRateLimit.mockResolvedValue(false);
    const res = await patientLogin(req());
    expect(res.status).toBe(429);
    expect((await res.json()).code).toBe('RATE_LIMITED');
    expect(mockFindUserByEmail).not.toHaveBeenCalled();
  });

  it('400 when the email is invalid', async () => {
    const res = await patientLogin(loginReq('http://localhost/api/auth/login', { email: 'nope', password: 'x' }));
    expect(res.status).toBe(400);
  });
});

describe('POST /api/dev/login (developer portal)', () => {
  const req = () => loginReq('http://localhost/api/dev/login', CREDS);

  it('rejects a patient credential at the dev portal (cross-portal)', async () => {
    mockFindUserByEmail.mockResolvedValue(activeUser({ account_type: 'patient' }));
    mockVerifyPassword.mockResolvedValue(true);
    const res = await devLogin(req());
    expectGeneric401(res.status, (await res.json()).code);
    expect(mockCreateSession).not.toHaveBeenCalled();
  });

  it('rejects a hospital-staff credential at the dev portal (cross-portal)', async () => {
    mockFindUserByEmail.mockResolvedValue(activeUser({ account_type: 'hospital_staff' }));
    mockVerifyPassword.mockResolvedValue(true);
    const res = await devLogin(req());
    expectGeneric401(res.status, (await res.json()).code);
    expect(mockCreateSession).not.toHaveBeenCalled();
  });

  it('401 (generic) for a wrong password and logs a dev login_failed', async () => {
    mockFindUserByEmail.mockResolvedValue(activeUser({ account_type: 'developer' }));
    mockVerifyPassword.mockResolvedValue(false);
    const res = await devLogin(req());
    expectGeneric401(res.status, (await res.json()).code);
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'login_failed', details: expect.objectContaining({ portal: 'dev' }) }),
    );
  });

  it('401 for an inactive developer', async () => {
    mockFindUserByEmail.mockResolvedValue(activeUser({ account_type: 'developer', is_active: false }));
    mockVerifyPassword.mockResolvedValue(true);
    const res = await devLogin(req());
    expectGeneric401(res.status, (await res.json()).code);
  });

  it('429 when rate-limited', async () => {
    mockCheckRateLimit.mockResolvedValue(false);
    const res = await devLogin(req());
    expect(res.status).toBe(429);
  });

  it('200 for a valid active developer', async () => {
    mockFindUserByEmail.mockResolvedValue(activeUser({ account_type: 'developer' }));
    mockVerifyPassword.mockResolvedValue(true);
    const res = await devLogin(req());
    expect(res.status).toBe(200);
    expect(mockCreateSession).toHaveBeenCalledWith('user-1', 'developer');
  });
});

describe('POST /api/hospital/login (hospital-staff portal)', () => {
  const req = () => loginReq('http://localhost/api/hospital/login', CREDS);

  it('rejects a patient credential at the hospital portal (cross-portal)', async () => {
    mockFindUserByEmail.mockResolvedValue(activeUser({ account_type: 'patient', hospital_id: 'h1' }));
    mockVerifyPassword.mockResolvedValue(true);
    const res = await hospitalLogin(req());
    expectGeneric401(res.status, (await res.json()).code);
    expect(mockCreateSession).not.toHaveBeenCalled();
  });

  it('401 when the staff account has a null hospital_id', async () => {
    mockFindUserByEmail.mockResolvedValue(
      activeUser({ account_type: 'hospital_staff', hospital_id: null }),
    );
    mockVerifyPassword.mockResolvedValue(true);
    const res = await hospitalLogin(req());
    expectGeneric401(res.status, (await res.json()).code);
    expect(mockCreateSession).not.toHaveBeenCalled();
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'login_failed', details: expect.objectContaining({ portal: 'hospital' }) }),
    );
  });

  it('401 (generic) for a wrong password', async () => {
    mockFindUserByEmail.mockResolvedValue(activeUser({ account_type: 'hospital_staff', hospital_id: 'h1' }));
    mockVerifyPassword.mockResolvedValue(false);
    const res = await hospitalLogin(req());
    expectGeneric401(res.status, (await res.json()).code);
  });

  it('401 for an inactive staff member', async () => {
    mockFindUserByEmail.mockResolvedValue(
      activeUser({ account_type: 'hospital_staff', hospital_id: 'h1', is_active: false }),
    );
    mockVerifyPassword.mockResolvedValue(true);
    const res = await hospitalLogin(req());
    expectGeneric401(res.status, (await res.json()).code);
  });

  it('429 when rate-limited', async () => {
    mockCheckRateLimit.mockResolvedValue(false);
    const res = await hospitalLogin(req());
    expect(res.status).toBe(429);
  });

  it('200 and returns hospital_id for a valid active staff member', async () => {
    mockFindUserByEmail.mockResolvedValue(
      activeUser({ account_type: 'hospital_staff', hospital_id: 'h1' }),
    );
    mockVerifyPassword.mockResolvedValue(true);
    const res = await hospitalLogin(req());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.hospital_id).toBe('h1');
    expect(mockCreateSession).toHaveBeenCalledWith('user-1', 'hospital_staff');
  });
});
