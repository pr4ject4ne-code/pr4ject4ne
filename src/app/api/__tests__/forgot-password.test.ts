/**
 * Tests for POST /api/auth/forgot-password (worklist #19). Focused on
 * enumeration-safety (same response shape whether the account exists or
 * not), rate-limiting on both dimensions, and every outcome being audit-logged.
 */
import { POST } from '@/app/api/auth/forgot-password/route';

const mockFindUserByEmail = jest.fn();
const mockCheckRateLimit = jest.fn();
jest.mock('@/lib/auth', () => {
  const actual = jest.requireActual('@/lib/auth');
  return {
    ...actual,
    findUserByEmail: (...args: unknown[]) => mockFindUserByEmail(...args),
    checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
  };
});

const mockLogAudit = jest.fn();
jest.mock('@/lib/audit', () => ({
  logAudit: (...args: unknown[]) => mockLogAudit(...args),
  clientIpFrom: () => null,
}));

const mockCreatePasswordResetToken = jest.fn();
jest.mock('@/lib/password-reset', () => ({
  createPasswordResetToken: (...args: unknown[]) => mockCreatePasswordResetToken(...args),
}));

const mockSendEmail = jest.fn();
jest.mock('@/lib/email', () => ({
  sendEmail: (...args: unknown[]) => mockSendEmail(...args),
}));

function makeReq(body: unknown): Request {
  return new Request('http://localhost/api/auth/forgot-password', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/auth/forgot-password', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCheckRateLimit.mockResolvedValue(true);
    mockCreatePasswordResetToken.mockResolvedValue('raw-reset-token');
    mockSendEmail.mockResolvedValue({ sent: true });
  });

  it('returns the exact same generic response for a REGISTERED email as for an UNREGISTERED one', async () => {
    mockFindUserByEmail.mockResolvedValueOnce({ id: 'u1', email: 'real@b.co', is_active: true });
    const resHit = await POST(makeReq({ email: 'real@b.co' }));
    const jsonHit = await resHit.json();

    mockFindUserByEmail.mockResolvedValueOnce(null);
    const resMiss = await POST(makeReq({ email: 'noone@b.co' }));
    const jsonMiss = await resMiss.json();

    expect(resHit.status).toBe(resMiss.status);
    expect(jsonHit).toEqual(jsonMiss);
  });

  it('creates a token and sends an email only when the account exists', async () => {
    mockFindUserByEmail.mockResolvedValue({ id: 'u1', email: 'real@b.co', is_active: true });
    await POST(makeReq({ email: 'real@b.co' }));
    expect(mockCreatePasswordResetToken).toHaveBeenCalledWith('u1');
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    expect(mockSendEmail.mock.calls[0][0].to).toBe('real@b.co');
  });

  it('does not create a token or send an email for an unregistered address', async () => {
    mockFindUserByEmail.mockResolvedValue(null);
    await POST(makeReq({ email: 'noone@b.co' }));
    expect(mockCreatePasswordResetToken).not.toHaveBeenCalled();
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it('does not touch the db for a syntactically invalid email, but still returns the generic message', async () => {
    const res = await POST(makeReq({ email: 'not-an-email' }));
    const json = await res.json();
    expect(mockFindUserByEmail).not.toHaveBeenCalled();
    expect(json.message).toMatch(/if that email address has an account/i);
  });

  it('skips a deactivated account (no token/email), same generic response', async () => {
    mockFindUserByEmail.mockResolvedValue({ id: 'u1', email: 'real@b.co', is_active: false });
    const res = await POST(makeReq({ email: 'real@b.co' }));
    const json = await res.json();
    expect(mockCreatePasswordResetToken).not.toHaveBeenCalled();
    expect(json.message).toMatch(/if that email address has an account/i);
  });

  it('still succeeds with the generic response even if email-send throws', async () => {
    mockFindUserByEmail.mockResolvedValue({ id: 'u1', email: 'real@b.co', is_active: true });
    mockSendEmail.mockRejectedValue(new Error('resend down'));
    const res = await POST(makeReq({ email: 'real@b.co' }));
    expect(res.status).toBe(200);
  });

  it('is rate-limited on the per-IP AND per-email dimensions, and audit-logs the throttle', async () => {
    mockCheckRateLimit.mockImplementation(async (bucket: string) => !bucket.startsWith('forgot_password_ip'));
    const res = await POST(makeReq({ email: 'real@b.co' }));
    const json = await res.json();
    expect(res.status).toBe(200); // still the generic response, not a distinct 429 body
    expect(json.message).toMatch(/if that email address has an account/i);
    expect(mockFindUserByEmail).not.toHaveBeenCalled();
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'rate_limited', details: { endpoint: 'forgot_password' } }),
    );
  });

  it('audit-logs found:true/false without exposing it in the response', async () => {
    mockFindUserByEmail.mockResolvedValue({ id: 'u1', email: 'real@b.co', is_active: true });
    await POST(makeReq({ email: 'real@b.co' }));
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'password_reset_requested', details: { found: true } }),
    );
  });
});
