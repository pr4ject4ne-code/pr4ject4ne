/**
 * Tests for POST /api/auth/reset-password (worklist #19).
 */
import { POST } from '@/app/api/auth/reset-password/route';

const mockCheckRateLimit = jest.fn();
jest.mock('@/lib/auth', () => {
  const actual = jest.requireActual('@/lib/auth');
  return {
    ...actual,
    checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
  };
});

const mockConsume = jest.fn();
jest.mock('@/lib/password-reset', () => ({
  consumePasswordResetToken: (...args: unknown[]) => mockConsume(...args),
}));

const mockLogAudit = jest.fn();
jest.mock('@/lib/audit', () => ({
  logAudit: (...args: unknown[]) => mockLogAudit(...args),
  clientIpFrom: () => null,
}));

function makeReq(body: unknown): Request {
  return new Request('http://localhost/api/auth/reset-password', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/auth/reset-password', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCheckRateLimit.mockResolvedValue(true);
  });

  it('returns 429 and audit-logs when rate-limited, without consuming the token', async () => {
    mockCheckRateLimit.mockResolvedValue(false);
    const res = await POST(makeReq({ token: 'sometoken', newPassword: 'Str0ng!Pass' }));
    expect(res.status).toBe(429);
    expect(mockConsume).not.toHaveBeenCalled();
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'rate_limited', details: { endpoint: 'reset_password' } }),
    );
  });

  it('succeeds on a valid token and audit-logs completion', async () => {
    mockConsume.mockResolvedValue({ ok: true, userId: 'u1' });
    const res = await POST(makeReq({ token: 'validtoken', newPassword: 'Str0ng!Pass' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'u1',
        action: 'password_reset_completed',
        details: { success: true },
      }),
    );
  });

  it('rejects an expired token with 400 and logs the failure reason', async () => {
    mockConsume.mockResolvedValue({ ok: false, reason: 'expired' });
    const res = await POST(makeReq({ token: 'oldtoken', newPassword: 'Str0ng!Pass' }));
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('EXPIRED');
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'password_reset_completed',
        details: { success: false, reason: 'expired' },
      }),
    );
  });

  it('rejects an already-used token', async () => {
    mockConsume.mockResolvedValue({ ok: false, reason: 'used' });
    const res = await POST(makeReq({ token: 'usedtoken', newPassword: 'Str0ng!Pass' }));
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('USED');
  });

  it('rejects a malformed/missing token as invalid', async () => {
    mockConsume.mockResolvedValue({ ok: false, reason: 'invalid' });
    const res = await POST(makeReq({}));
    expect(mockConsume).toHaveBeenCalledWith('', '');
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('INVALID');
  });

  it('rejects a weak new password with its specific reason', async () => {
    mockConsume.mockResolvedValue({ ok: false, reason: 'weak_password', message: 'Include a symbol.' });
    const res = await POST(makeReq({ token: 'validtoken', newPassword: 'weak' }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.code).toBe('WEAK_PASSWORD');
    expect(json.error).toBe('Include a symbol.');
  });
});
