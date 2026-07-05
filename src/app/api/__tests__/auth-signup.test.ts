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
  };
});

jest.mock('@/lib/audit', () => ({
  logAudit: jest.fn().mockResolvedValue(undefined),
  clientIpFrom: () => null,
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
});
