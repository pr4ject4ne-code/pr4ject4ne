/**
 * Integration-style tests for the signup route with the db + auth libs mocked.
 * Verifies validation branches and the happy path without a live database.
 */
import { POST } from '@/app/api/auth/signup/route';

const cookieSet = jest.fn();
jest.mock('next/headers', () => ({
  cookies: () => ({ set: cookieSet }),
}));

const mockFindUserByEmail = jest.fn();
const mockWithTransaction = jest.fn();
const mockCheckRateLimit = jest.fn();

jest.mock('@/lib/db', () => ({
  withTransaction: (...args: unknown[]) => mockWithTransaction(...args),
}));

jest.mock('@/lib/auth', () => {
  const actual = jest.requireActual('@/lib/auth');
  return {
    ...actual,
    findUserByEmail: (...args: unknown[]) => mockFindUserByEmail(...args),
    hashPassword: jest.fn().mockResolvedValue('$2a$12$hashedhashedhashed'),
    createSession: jest.fn().mockResolvedValue({ token: 'tok', expiresAt: new Date() }),
    checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
  };
});

jest.mock('@/lib/audit', () => ({
  logAudit: jest.fn().mockResolvedValue(undefined),
  clientIpFrom: () => null,
}));

const mockCreateEmailVerificationToken = jest.fn();
jest.mock('@/lib/email-verification', () => ({
  createEmailVerificationToken: (...args: unknown[]) => mockCreateEmailVerificationToken(...args),
}));

const mockSendEmail = jest.fn();
jest.mock('@/lib/email', () => ({
  sendEmail: (...args: unknown[]) => mockSendEmail(...args),
}));

function makeReq(body: unknown): Request {
  return new Request('http://localhost/api/auth/signup', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/auth/signup', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCheckRateLimit.mockResolvedValue(true); // under the limit by default
    mockCreateEmailVerificationToken.mockResolvedValue('raw-verification-token');
    mockSendEmail.mockResolvedValue({ sent: true });
  });

  it('returns 429 when the signup rate limit is exceeded', async () => {
    mockFindUserByEmail.mockResolvedValue(null);
    mockCheckRateLimit.mockResolvedValue(false);
    const res = await POST(makeReq({ email: 'a@b.co', password: 'SecurePass123!' }));
    expect(res.status).toBe(429);
    expect((await res.json()).code).toBe('RATE_LIMITED');
    // Throttled before any DB work / bcrypt.
    expect(mockFindUserByEmail).not.toHaveBeenCalled();
    expect(mockWithTransaction).not.toHaveBeenCalled();
  });

  it('rejects an invalid email', async () => {
    const res = await POST(makeReq({ email: 'nope', password: 'SecurePass123!' }));
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('INVALID_EMAIL');
  });

  it('rejects a weak password', async () => {
    const res = await POST(makeReq({ email: 'a@b.co', password: 'weak' }));
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('WEAK_PASSWORD');
  });

  it('rejects a duplicate email', async () => {
    mockFindUserByEmail.mockResolvedValue({ id: 'existing' });
    const res = await POST(makeReq({ email: 'a@b.co', password: 'SecurePass123!' }));
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('EMAIL_EXISTS');
  });

  it('creates the account and returns an IHN code', async () => {
    mockFindUserByEmail.mockResolvedValue(null);
    mockWithTransaction.mockResolvedValue('new-user-id');
    const res = await POST(makeReq({ email: 'a@b.co', password: 'SecurePass123!' }));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.user_id).toBe('new-user-id');
    expect(json.ihn_code).toMatch(/^IHN-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect(cookieSet).toHaveBeenCalled();
  });

  it('sends a verification/welcome email on signup, addressed to the new account', async () => {
    mockFindUserByEmail.mockResolvedValue(null);
    mockWithTransaction.mockResolvedValue('new-user-id');
    const res = await POST(makeReq({ email: 'a@b.co', password: 'SecurePass123!' }));
    expect(res.status).toBe(201);
    expect(mockCreateEmailVerificationToken).toHaveBeenCalledWith('new-user-id');
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    const emailArg = mockSendEmail.mock.calls[0][0];
    expect(emailArg.to).toBe('a@b.co');
    expect(emailArg.subject).toMatch(/confirm/i);
    expect(emailArg.html).toContain('raw-verification-token');
  });

  it('still succeeds (201) even if the email wrapper throws (Resend outage)', async () => {
    mockFindUserByEmail.mockResolvedValue(null);
    mockWithTransaction.mockResolvedValue('new-user-id');
    mockSendEmail.mockRejectedValue(new Error('resend is down'));
    const res = await POST(makeReq({ email: 'a@b.co', password: 'SecurePass123!' }));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.success).toBe(true);
  });

  it('still succeeds (201) even if token creation itself throws', async () => {
    mockFindUserByEmail.mockResolvedValue(null);
    mockWithTransaction.mockResolvedValue('new-user-id');
    mockCreateEmailVerificationToken.mockRejectedValue(new Error('db down'));
    const res = await POST(makeReq({ email: 'a@b.co', password: 'SecurePass123!' }));
    expect(res.status).toBe(201);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });
});
