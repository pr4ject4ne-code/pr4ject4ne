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
import { POST as totpLogin } from '@/app/api/auth/login/totp/route';

const mockFindUserByEmail = jest.fn();
const mockFindUserById = jest.fn();
const mockVerifyPassword = jest.fn();
const mockCreateSession = jest.fn();
const mockCheckRateLimit = jest.fn();
/** Raw `checkRateLimit` (as opposed to the `checkLoginRateLimit` wrapper) — used
 * directly by /api/auth/login/totp for its IP + challenge-owning-user buckets. */
const mockCheckRateLimitDirect = jest.fn();
const mockLogAudit = jest.fn().mockResolvedValue(undefined);
const mockCookieSet = jest.fn();
const mockGenerateChallengeToken = jest.fn();
const mockDecryptTotpSecret = jest.fn();
const mockVerifyTotpCode = jest.fn();
const mockMatchRecoveryCode = jest.fn();
const mockCreateLoginMfaChallenge = jest.fn();

jest.mock('next/headers', () => ({
  cookies: () => ({
    set: (...a: unknown[]) => mockCookieSet(...a),
    get: () => undefined,
    delete: jest.fn(),
  }),
}));

jest.mock('@/lib/auth', () => {
  const actual = jest.requireActual('@/lib/auth');
  return {
    ...actual,
    findUserByEmail: (...a: unknown[]) => mockFindUserByEmail(...a),
    findUserById: (...a: unknown[]) => mockFindUserById(...a),
    verifyPassword: (...a: unknown[]) => mockVerifyPassword(...a),
    createSession: (...a: unknown[]) => mockCreateSession(...a),
    // All three login routes gate on the shared checkLoginRateLimit (one bucket per
    // email across every login endpoint); mock it directly since its internal call
    // to checkRateLimit doesn't go through the module export.
    checkLoginRateLimit: (...a: unknown[]) => mockCheckRateLimit(...a),
    checkRateLimit: (...a: unknown[]) => mockCheckRateLimitDirect(...a),
  };
});

jest.mock('@/lib/totp', () => {
  const actual = jest.requireActual('@/lib/totp');
  return {
    generateChallengeToken: (...a: unknown[]) => mockGenerateChallengeToken(...a),
    decryptTotpSecret: (...a: unknown[]) => mockDecryptTotpSecret(...a),
    verifyTotpCode: (...a: unknown[]) => mockVerifyTotpCode(...a),
    matchRecoveryCode: (...a: unknown[]) => mockMatchRecoveryCode(...a),
    // requiresLoginMfa is pure (no DB/IO) — use the REAL implementation so both
    // login routes are checked against the actual gating condition, not a
    // test-controlled stand-in that could silently diverge from it.
    requiresLoginMfa: (...a: Parameters<typeof actual.requiresLoginMfa>) => actual.requiresLoginMfa(...a),
    createLoginMfaChallenge: (...a: unknown[]) => mockCreateLoginMfaChallenge(...a),
  };
});

const mockDbQuery = jest.fn().mockResolvedValue({ rows: [], rowCount: 0 });
const mockDbQueryOne = jest.fn();

jest.mock('@/lib/db', () => ({
  query: (...a: unknown[]) => mockDbQuery(...a),
  queryOne: (...a: unknown[]) => mockDbQueryOne(...a),
  withTransaction: (fn: (tx: { query: (...a: unknown[]) => unknown }) => unknown) =>
    fn({ query: (...a: unknown[]) => mockDbQuery(...a) }),
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
  mockCheckRateLimitDirect.mockResolvedValue(true);
  mockCreateSession.mockResolvedValue({ token: 'tok', expiresAt: new Date(Date.now() + 60000) });
  mockDbQuery.mockResolvedValue({ rows: [], rowCount: 0 });
  mockGenerateChallengeToken.mockReturnValue('raw-challenge-token');
  mockCreateLoginMfaChallenge.mockResolvedValue('raw-challenge-token');
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

  describe('two-factor authentication (migration 021 — primary developers only)', () => {
    it('a totp-enabled primary developer gets mfa_required — no session/cookie/last_login/login-audit yet', async () => {
      mockFindUserByEmail.mockResolvedValue(
        activeUser({
          account_type: 'developer',
          access_level: 'primary',
          hospital_id: null,
          totp_enabled: true,
        }),
      );
      mockVerifyPassword.mockResolvedValue(true);
      const res = await patientLogin(req());
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.mfa_required).toBe(true);
      expect(json.challenge_token).toBe('raw-challenge-token');
      expect(json.redirect).toBeUndefined();

      expect(mockCreateSession).not.toHaveBeenCalled();
      expect(mockCookieSet).not.toHaveBeenCalled();
      expect(mockLogAudit).not.toHaveBeenCalledWith(expect.objectContaining({ action: 'login' }));
      expect(mockCreateLoginMfaChallenge).toHaveBeenCalledWith('user-1');
      expect(
        mockDbQuery.mock.calls.some(([sql]) => String(sql).includes('UPDATE users SET last_login')),
      ).toBe(false);
    });

    it('a patient with a totp_enabled-like flag set NEVER receives mfa_required (structurally impossible)', async () => {
      mockFindUserByEmail.mockResolvedValue(
        activeUser({ account_type: 'patient', hospital_id: null, totp_enabled: true }),
      );
      mockVerifyPassword.mockResolvedValue(true);
      const res = await patientLogin(req());
      const json = await res.json();
      expect(json.mfa_required).toBeUndefined();
      expect(mockCreateSession).toHaveBeenCalledWith('user-1', 'patient');
    });

    it('hospital_staff with a totp_enabled-like flag set NEVER receives mfa_required (structurally impossible)', async () => {
      mockFindUserByEmail.mockResolvedValue(
        activeUser({ account_type: 'hospital_staff', hospital_id: 'h1', totp_enabled: true }),
      );
      mockVerifyPassword.mockResolvedValue(true);
      const res = await patientLogin(req());
      const json = await res.json();
      expect(json.mfa_required).toBeUndefined();
      expect(mockCreateSession).toHaveBeenCalledWith('user-1', 'hospital_staff');
    });

    it('a SECONDARY developer with totp_enabled set NEVER receives mfa_required (structurally impossible — primary-only)', async () => {
      mockFindUserByEmail.mockResolvedValue(
        activeUser({
          account_type: 'developer',
          access_level: 'secondary',
          hospital_id: null,
          totp_enabled: true,
        }),
      );
      mockVerifyPassword.mockResolvedValue(true);
      const res = await patientLogin(req());
      const json = await res.json();
      expect(json.mfa_required).toBeUndefined();
      expect(mockCreateSession).toHaveBeenCalledWith('user-1', 'developer');
    });
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

  describe('two-factor authentication (this segregated portal must gate identically to /api/auth/login)', () => {
    it('a totp-enabled primary developer gets mfa_required here too — no session/cookie/last_login/login-audit', async () => {
      mockFindUserByEmail.mockResolvedValue(
        activeUser({ account_type: 'developer', access_level: 'primary', totp_enabled: true }),
      );
      mockVerifyPassword.mockResolvedValue(true);
      const res = await devLogin(req());
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.mfa_required).toBe(true);
      expect(json.challenge_token).toBe('raw-challenge-token');
      expect(json.success).toBeUndefined();

      expect(mockCreateSession).not.toHaveBeenCalled();
      expect(mockCookieSet).not.toHaveBeenCalled();
      expect(mockLogAudit).not.toHaveBeenCalledWith(expect.objectContaining({ action: 'login' }));
      expect(mockCreateLoginMfaChallenge).toHaveBeenCalledWith('user-1');
      expect(
        mockDbQuery.mock.calls.some(([sql]) => String(sql).includes('UPDATE users SET last_login')),
      ).toBe(false);
    });

    it('a SECONDARY developer with totp_enabled set logs in unaffected here too (primary-only gate, no regression)', async () => {
      mockFindUserByEmail.mockResolvedValue(
        activeUser({ account_type: 'developer', access_level: 'secondary', totp_enabled: true }),
      );
      mockVerifyPassword.mockResolvedValue(true);
      const res = await devLogin(req());
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.mfa_required).toBeUndefined();
      expect(mockCreateSession).toHaveBeenCalledWith('user-1', 'developer');
      expect(mockCreateLoginMfaChallenge).not.toHaveBeenCalled();
    });

    it('a primary developer WITHOUT totp_enabled logs in unaffected (no regression)', async () => {
      mockFindUserByEmail.mockResolvedValue(
        activeUser({ account_type: 'developer', access_level: 'primary', totp_enabled: false }),
      );
      mockVerifyPassword.mockResolvedValue(true);
      const res = await devLogin(req());
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.mfa_required).toBeUndefined();
      expect(mockCreateSession).toHaveBeenCalledWith('user-1', 'developer');
    });
  });
});

describe('MFA challenge completion is generic across whichever route created it', () => {
  it('a challenge created via /api/dev/login completes successfully at /api/auth/login/totp', async () => {
    // Step 1: dev portal login for a totp-enabled primary developer never
    // issues a session — it hands back a challenge token, same as the unified
    // /api/auth/login branch.
    mockFindUserByEmail.mockResolvedValue(
      activeUser({ account_type: 'developer', access_level: 'primary', totp_enabled: true }),
    );
    mockVerifyPassword.mockResolvedValue(true);
    mockCreateLoginMfaChallenge.mockResolvedValue('dev-portal-challenge-token');

    const devRes = await devLogin(loginReq('http://localhost/api/dev/login', CREDS));
    expect(devRes.status).toBe(200);
    const devJson = await devRes.json();
    expect(devJson.mfa_required).toBe(true);
    expect(devJson.challenge_token).toBe('dev-portal-challenge-token');
    expect(mockCreateSession).not.toHaveBeenCalled();

    // Step 2: /api/auth/login/totp has no notion of which route created the
    // challenge — it looks the token hash up in mfa_challenges and completes
    // the login the same way regardless of origin.
    mockDbQueryOne.mockResolvedValue({
      id: 'chal-1',
      user_id: 'user-1',
      consumed_at: null,
      is_expired: false,
    });
    mockFindUserById.mockResolvedValue({
      id: 'user-1',
      account_type: 'developer',
      access_level: 'primary',
      is_active: true,
      hospital_id: null,
      totp_enabled: true,
      totp_secret_encrypted: 'enc(SECRET)',
      totp_recovery_codes: [],
    });
    mockDecryptTotpSecret.mockReturnValue('SECRET');
    mockVerifyTotpCode.mockReturnValue(true);
    mockDbQuery.mockImplementation((sql: string) => {
      if (String(sql).includes('UPDATE mfa_challenges')) return Promise.resolve({ rows: [{ id: 'chal-1' }] });
      return Promise.resolve({ rows: [], rowCount: 1 });
    });

    const totpRes = await totpLogin(
      new Request('http://localhost/api/auth/login/totp', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ challenge_token: 'dev-portal-challenge-token', code: '123456' }),
      }),
    );
    expect(totpRes.status).toBe(200);
    const totpJson = await totpRes.json();
    expect(totpJson.success).toBe(true);
    expect(mockCreateSession).toHaveBeenCalledWith('user-1', 'developer');
    expect(mockCookieSet).toHaveBeenCalled();
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

describe('POST /api/auth/login/totp (second factor)', () => {
  function mfaReq(challengeToken: string, code: string): Request {
    return new Request('http://localhost/api/auth/login/totp', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ challenge_token: challengeToken, code }),
    });
  }

  function pendingChallenge(overrides: Record<string, unknown> = {}) {
    return { id: 'chal-1', user_id: 'user-1', consumed_at: null, is_expired: false, ...overrides };
  }

  function primaryTotpUser(overrides: Record<string, unknown> = {}) {
    return {
      id: 'user-1',
      account_type: 'developer',
      access_level: 'primary',
      is_active: true,
      hospital_id: null,
      totp_enabled: true,
      totp_secret_encrypted: 'enc(SECRET)',
      totp_recovery_codes: [],
      ...overrides,
    };
  }

  it('completes login with a valid TOTP code — creates a real session and matches the normal success shape', async () => {
    mockDbQueryOne.mockResolvedValue(pendingChallenge());
    mockFindUserById.mockResolvedValue(primaryTotpUser());
    mockDecryptTotpSecret.mockReturnValue('SECRET');
    mockVerifyTotpCode.mockReturnValue(true);
    mockDbQuery.mockImplementation((sql: string) => {
      if (String(sql).includes('UPDATE mfa_challenges')) return Promise.resolve({ rows: [{ id: 'chal-1' }] });
      return Promise.resolve({ rows: [], rowCount: 1 });
    });

    const res = await totpLogin(mfaReq('raw-token', '123456'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual(
      expect.objectContaining({
        success: true,
        user_id: 'user-1',
        account_type: 'developer',
        access_level: 'primary',
        hospital_id: null,
        redirect: '/dev/dashboard',
      }),
    );
    expect(mockCreateSession).toHaveBeenCalledWith('user-1', 'developer');
    expect(mockCookieSet).toHaveBeenCalled();
    expect(
      mockDbQuery.mock.calls.some(([sql]) => String(sql).includes('UPDATE users SET last_login')),
    ).toBe(true);
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'login', userId: 'user-1', details: { via: 'totp' } }),
    );
  });

  it('401 on a wrong code — no session created, logs totp_verify_failed', async () => {
    mockDbQueryOne.mockResolvedValue(pendingChallenge());
    mockFindUserById.mockResolvedValue(primaryTotpUser());
    mockDecryptTotpSecret.mockReturnValue('SECRET');
    mockVerifyTotpCode.mockReturnValue(false);
    mockMatchRecoveryCode.mockReturnValue(null);

    const res = await totpLogin(mfaReq('raw-token', '000000'));
    expect(res.status).toBe(401);
    expect(mockCreateSession).not.toHaveBeenCalled();
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'totp_verify_failed', userId: 'user-1' }),
    );
  });

  it('429 when the IP bucket is rate-limited (before touching the challenge)', async () => {
    mockCheckRateLimitDirect.mockImplementation((bucket: string) =>
      Promise.resolve(!bucket.startsWith('login_totp_ip:')),
    );
    const res = await totpLogin(mfaReq('raw-token', '000000'));
    expect(res.status).toBe(429);
    expect(mockDbQueryOne).not.toHaveBeenCalled();
  });

  it('429 when the challenge-owning user\'s bucket is rate-limited', async () => {
    mockDbQueryOne.mockResolvedValue(pendingChallenge());
    mockCheckRateLimitDirect.mockImplementation((bucket: string) =>
      Promise.resolve(!bucket.startsWith('login_totp_user:')),
    );
    const res = await totpLogin(mfaReq('raw-token', '000000'));
    expect(res.status).toBe(429);
    expect(mockCreateSession).not.toHaveBeenCalled();
  });

  it('rejects an expired challenge token', async () => {
    mockDbQueryOne.mockResolvedValue(pendingChallenge({ is_expired: true }));
    const res = await totpLogin(mfaReq('raw-token', '123456'));
    expect(res.status).toBe(401);
    expect(mockCreateSession).not.toHaveBeenCalled();
  });

  it('rejects an already-consumed challenge token', async () => {
    mockDbQueryOne.mockResolvedValue(pendingChallenge({ consumed_at: new Date().toISOString() }));
    const res = await totpLogin(mfaReq('raw-token', '123456'));
    expect(res.status).toBe(401);
    expect(mockCreateSession).not.toHaveBeenCalled();
  });

  it('rejects an unknown challenge token (no matching row)', async () => {
    mockDbQueryOne.mockResolvedValue(null);
    const res = await totpLogin(mfaReq('bogus-token', '123456'));
    expect(res.status).toBe(401);
    expect(mockCreateSession).not.toHaveBeenCalled();
  });

  it('logs in successfully via a valid, unused recovery code', async () => {
    mockDbQueryOne.mockResolvedValue(pendingChallenge());
    mockFindUserById.mockResolvedValue(primaryTotpUser({ totp_recovery_codes: ['hash(AAAA)'] }));
    mockDecryptTotpSecret.mockReturnValue('SECRET');
    mockVerifyTotpCode.mockReturnValue(false);
    mockMatchRecoveryCode.mockReturnValue('hash(AAAA)');
    mockDbQuery.mockImplementation((sql: string) => {
      if (String(sql).includes('UPDATE mfa_challenges')) return Promise.resolve({ rows: [{ id: 'chal-1' }] });
      if (String(sql).includes('array_remove')) return Promise.resolve({ rows: [{ id: 'user-1' }] });
      return Promise.resolve({ rows: [], rowCount: 1 });
    });

    const res = await totpLogin(mfaReq('raw-token', 'AAAA-AAAA-AAAA-AAAA'));
    expect(res.status).toBe(200);
    expect(mockCreateSession).toHaveBeenCalledWith('user-1', 'developer');
  });

  it('rejects reusing the SAME recovery code (already removed -> the atomic array_remove finds 0 rows)', async () => {
    mockDbQueryOne.mockResolvedValue(pendingChallenge());
    mockFindUserById.mockResolvedValue(primaryTotpUser({ totp_recovery_codes: [] }));
    mockDecryptTotpSecret.mockReturnValue('SECRET');
    mockVerifyTotpCode.mockReturnValue(false);
    // The code still LOOKS like a match at the app layer (e.g. a stale in-memory
    // read), but the DB-level atomic removal loses the race — 0 rows affected.
    mockMatchRecoveryCode.mockReturnValue('hash(AAAA)');
    mockDbQuery.mockImplementation((sql: string) => {
      if (String(sql).includes('UPDATE mfa_challenges')) return Promise.resolve({ rows: [{ id: 'chal-1' }] });
      if (String(sql).includes('array_remove')) return Promise.resolve({ rows: [] });
      return Promise.resolve({ rows: [], rowCount: 1 });
    });

    const res = await totpLogin(mfaReq('raw-token', 'AAAA-AAAA-AAAA-AAAA'));
    expect(res.status).toBe(401);
    expect(mockCreateSession).not.toHaveBeenCalled();
  });

  it('400 without a challenge_token or code', async () => {
    const res = await totpLogin(mfaReq('', ''));
    expect(res.status).toBe(400);
  });
});
