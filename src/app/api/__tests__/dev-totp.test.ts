/**
 * Tests for the primary-only 2FA enrollment/verify/disable routes
 * (/api/dev/totp/*, migration 021). Mocks the crypto boundary (@/lib/totp) so
 * we control secrets/codes deterministically, and asserts explicitly that no
 * raw secret or recovery code ever reaches an audit log call.
 */
import { POST as enroll } from '@/app/api/dev/totp/enroll/route';
import { POST as verifyEnroll } from '@/app/api/dev/totp/verify-enroll/route';
import { POST as disable } from '@/app/api/dev/totp/disable/route';

const mockGetDevUser = jest.fn();
const mockIsPrimary = jest.fn();
const mockQuery = jest.fn();
const mockCheckRateLimit = jest.fn();
const mockLogAudit = jest.fn().mockResolvedValue(undefined);

jest.mock('@/lib/dev-auth', () => ({
  getDevUser: (...a: unknown[]) => mockGetDevUser(...a),
  isPrimary: (...a: unknown[]) => mockIsPrimary(...a),
}));
jest.mock('@/lib/db', () => ({
  query: (...a: unknown[]) => mockQuery(...a),
}));
jest.mock('@/lib/auth', () => ({
  checkRateLimit: (...a: unknown[]) => mockCheckRateLimit(...a),
}));
jest.mock('@/lib/audit', () => ({
  logAudit: (...a: unknown[]) => mockLogAudit(...a),
  clientIpFrom: () => null,
}));
jest.mock('@/lib/totp', () => ({
  generateTotpSecret: jest.fn(() => 'THESECRETBASE32'),
  totpKeyUri: jest.fn((email: string, secret: string) => `otpauth://totp/Racoon%20Eye:${email}?secret=${secret}`),
  encryptTotpSecret: jest.fn((s: string) => `enc(${s})`),
  decryptTotpSecret: jest.fn((s: string) => s.replace(/^enc\(/, '').replace(/\)$/, '')),
  verifyTotpCode: jest.fn(),
  generateRecoveryCodes: jest.fn(() => ['AAAA-AAAA-AAAA-AAAA', 'BBBB-BBBB-BBBB-BBBB']),
  hashRecoveryCode: jest.fn((c: string) => `hash(${c})`),
  matchRecoveryCode: jest.fn(),
}));

import { verifyTotpCode, matchRecoveryCode } from '@/lib/totp';

const DEV = { id: 'dev-1', email: 'primary@racooneye.test' };

function req(url: string, body?: unknown): Request {
  return new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function enrollReq() {
  return req('http://localhost/api/dev/totp/enroll');
}
function verifyEnrollReq(code: string) {
  return req('http://localhost/api/dev/totp/verify-enroll', { code });
}
function disableReq(code: string) {
  return req('http://localhost/api/dev/totp/disable', { code });
}

/** Every argument logAudit was ever called with, flattened for a leak scan. */
function allAuditPayloads(): string {
  return JSON.stringify(mockLogAudit.mock.calls);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetDevUser.mockResolvedValue({ ...DEV });
  mockIsPrimary.mockReturnValue(true);
  mockCheckRateLimit.mockResolvedValue(true);
  mockQuery.mockResolvedValue({ rows: [], rowCount: 1 });
});

describe('non-primary accounts are forbidden on every 2FA route', () => {
  beforeEach(() => {
    mockIsPrimary.mockReturnValue(false);
  });

  it('enroll -> 403', async () => {
    const res = await enroll();
    expect(res.status).toBe(403);
  });

  it('verify-enroll -> 403', async () => {
    const res = await verifyEnroll(verifyEnrollReq('123456'));
    expect(res.status).toBe(403);
  });

  it('disable -> 403', async () => {
    const res = await disable(disableReq('123456'));
    expect(res.status).toBe(403);
  });

  it('403 also when there is no dev session at all', async () => {
    mockGetDevUser.mockResolvedValue(null);
    expect((await enroll()).status).toBe(403);
    expect((await verifyEnroll(verifyEnrollReq('123456'))).status).toBe(403);
    expect((await disable(disableReq('123456'))).status).toBe(403);
  });
});

describe('POST /api/dev/totp/enroll', () => {
  it('generates + encrypts a secret, stores it, leaves totp_enabled untouched', async () => {
    const res = await enroll();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.secret).toBe('THESECRETBASE32');
    expect(json.otpauth_uri).toContain('THESECRETBASE32');
    const updateCall = mockQuery.mock.calls.find(([sql]) => String(sql).includes('UPDATE users'));
    expect(updateCall).toBeDefined();
    const [sql, values] = updateCall as [string, unknown[]];
    expect(sql).not.toContain('totp_enabled');
    expect(values).toEqual([DEV.id, 'enc(THESECRETBASE32)']);
  });

  it('429 when rate-limited', async () => {
    mockCheckRateLimit.mockResolvedValue(false);
    const res = await enroll();
    expect(res.status).toBe(429);
  });
});

describe('POST /api/dev/totp/verify-enroll', () => {
  it('400 when there is no pending enrollment', async () => {
    mockGetDevUser.mockResolvedValue({ ...DEV, totp_secret_encrypted: null });
    const res = await verifyEnroll(verifyEnrollReq('123456'));
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('NO_PENDING_ENROLLMENT');
  });

  it('400 when already enabled', async () => {
    mockGetDevUser.mockResolvedValue({
      ...DEV,
      totp_secret_encrypted: 'enc(SECRET)',
      totp_enabled: true,
    });
    const res = await verifyEnroll(verifyEnrollReq('123456'));
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('ALREADY_ENABLED');
  });

  it('401 on a wrong code, and logs totp_verify_failed with no secret in the details', async () => {
    mockGetDevUser.mockResolvedValue({ ...DEV, totp_secret_encrypted: 'enc(SECRET)', totp_enabled: false });
    (verifyTotpCode as jest.Mock).mockReturnValue(false);
    const res = await verifyEnroll(verifyEnrollReq('000000'));
    expect(res.status).toBe(401);
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'totp_verify_failed', userId: DEV.id }),
    );
    expect(allAuditPayloads()).not.toContain('SECRET');
  });

  it('200 on a correct code: enables 2FA, returns recovery codes once, audits without leaking secrets/codes', async () => {
    mockGetDevUser.mockResolvedValue({ ...DEV, totp_secret_encrypted: 'enc(SECRET)', totp_enabled: false });
    (verifyTotpCode as jest.Mock).mockReturnValue(true);
    const res = await verifyEnroll(verifyEnrollReq('654321'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.recovery_codes).toEqual(['AAAA-AAAA-AAAA-AAAA', 'BBBB-BBBB-BBBB-BBBB']);

    const updateCall = mockQuery.mock.calls.find(([sql]) => String(sql).includes('totp_enabled = true'));
    expect(updateCall).toBeDefined();
    const [, values] = updateCall as [string, unknown[]];
    // Stored codes are hashes, never the plaintext codes.
    expect(values[1]).toEqual(['hash(AAAA-AAAA-AAAA-AAAA)', 'hash(BBBB-BBBB-BBBB-BBBB)']);

    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'totp_enrolled', userId: DEV.id }),
    );
    const payloads = allAuditPayloads();
    expect(payloads).not.toContain('SECRET');
    expect(payloads).not.toContain('AAAA-AAAA-AAAA-AAAA');
    expect(payloads).not.toContain('BBBB-BBBB-BBBB-BBBB');
  });
});

describe('POST /api/dev/totp/disable', () => {
  it('400 when 2FA is not enabled', async () => {
    mockGetDevUser.mockResolvedValue({ ...DEV, totp_enabled: false, totp_secret_encrypted: null });
    const res = await disable(disableReq('123456'));
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('NOT_ENABLED');
  });

  it('401 on a wrong TOTP code AND no matching recovery code', async () => {
    mockGetDevUser.mockResolvedValue({
      ...DEV,
      totp_enabled: true,
      totp_secret_encrypted: 'enc(SECRET)',
      totp_recovery_codes: ['hash(AAAA-AAAA-AAAA-AAAA)'],
    });
    (verifyTotpCode as jest.Mock).mockReturnValue(false);
    (matchRecoveryCode as jest.Mock).mockReturnValue(null);
    const res = await disable(disableReq('000000'));
    expect(res.status).toBe(401);
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'totp_verify_failed', userId: DEV.id }),
    );
  });

  it('clears every TOTP column on a valid TOTP code and audits totp_disabled', async () => {
    mockGetDevUser.mockResolvedValue({
      ...DEV,
      totp_enabled: true,
      totp_secret_encrypted: 'enc(SECRET)',
      totp_recovery_codes: ['hash(AAAA-AAAA-AAAA-AAAA)'],
    });
    (verifyTotpCode as jest.Mock).mockReturnValue(true);
    const res = await disable(disableReq('123456'));
    expect(res.status).toBe(200);
    const updateCall = mockQuery.mock.calls.find(([sql]) => String(sql).includes('totp_enabled = false'));
    expect(updateCall).toBeDefined();
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'totp_disabled', userId: DEV.id }),
    );
  });

  it('succeeds via a valid recovery code when the TOTP code is wrong', async () => {
    mockGetDevUser.mockResolvedValue({
      ...DEV,
      totp_enabled: true,
      totp_secret_encrypted: 'enc(SECRET)',
      totp_recovery_codes: ['hash(AAAA-AAAA-AAAA-AAAA)'],
    });
    (verifyTotpCode as jest.Mock).mockReturnValue(false);
    (matchRecoveryCode as jest.Mock).mockReturnValue('hash(AAAA-AAAA-AAAA-AAAA)');
    const res = await disable(disableReq('AAAA-AAAA-AAAA-AAAA'));
    expect(res.status).toBe(200);
  });

  it('429 when rate-limited', async () => {
    mockGetDevUser.mockResolvedValue({ ...DEV, totp_enabled: true, totp_secret_encrypted: 'enc(SECRET)' });
    mockCheckRateLimit.mockResolvedValue(false);
    const res = await disable(disableReq('123456'));
    expect(res.status).toBe(429);
  });
});
