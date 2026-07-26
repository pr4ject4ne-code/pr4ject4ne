/**
 * Tests for GET /api/auth/verify-email (worklist #18).
 */
import { GET } from '@/app/api/auth/verify-email/route';

const mockConsume = jest.fn();
jest.mock('@/lib/email-verification', () => ({
  consumeEmailVerificationToken: (...args: unknown[]) => mockConsume(...args),
}));

const mockCheckRateLimit = jest.fn();
jest.mock('@/lib/auth', () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
}));

const mockLogAudit = jest.fn();
jest.mock('@/lib/audit', () => ({
  logAudit: (...args: unknown[]) => mockLogAudit(...args),
  clientIpFrom: () => null,
}));

function makeReq(token?: string): Request {
  const url = token
    ? `http://localhost/api/auth/verify-email?token=${encodeURIComponent(token)}`
    : 'http://localhost/api/auth/verify-email';
  return new Request(url);
}

describe('GET /api/auth/verify-email', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCheckRateLimit.mockResolvedValue(true);
  });

  it('redirects to /verify-email?status=rate_limited when throttled, without consuming a token', async () => {
    mockCheckRateLimit.mockResolvedValue(false);
    const res = await GET(makeReq('sometoken'));
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('/verify-email?status=rate_limited');
    expect(mockConsume).not.toHaveBeenCalled();
  });

  it('audit-logs the rate-limited outcome too, not just consumed-token outcomes', async () => {
    mockCheckRateLimit.mockResolvedValue(false);
    await GET(makeReq('sometoken'));
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'rate_limited', details: { endpoint: 'verify_email' } }),
    );
  });

  it('redirects to status=success on a valid token and audit-logs success', async () => {
    mockConsume.mockResolvedValue({ ok: true, userId: 'user-1' });
    const res = await GET(makeReq('validtoken'));
    expect(res.headers.get('location')).toContain('/verify-email?status=success');
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', action: 'email_verified', details: { success: true } }),
    );
  });

  it('redirects to status=expired and audit-logs the failure reason', async () => {
    mockConsume.mockResolvedValue({ ok: false, reason: 'expired' });
    const res = await GET(makeReq('oldtoken'));
    expect(res.headers.get('location')).toContain('/verify-email?status=expired');
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'email_verified', details: { success: false, reason: 'expired' } }),
    );
  });

  it('redirects to status=used for an already-consumed token', async () => {
    mockConsume.mockResolvedValue({ ok: false, reason: 'used' });
    const res = await GET(makeReq('usedtoken'));
    expect(res.headers.get('location')).toContain('/verify-email?status=used');
  });

  it('treats a missing token param as invalid', async () => {
    mockConsume.mockResolvedValue({ ok: false, reason: 'invalid' });
    const res = await GET(makeReq());
    expect(mockConsume).toHaveBeenCalledWith('');
    expect(res.headers.get('location')).toContain('/verify-email?status=invalid');
  });
});
