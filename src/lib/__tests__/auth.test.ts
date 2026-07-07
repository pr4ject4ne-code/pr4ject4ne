import {
  hashPassword,
  verifyPassword,
  isValidEmail,
  validatePasswordStrength,
  generateSessionToken,
  hashToken,
  constantTimeEquals,
  toPublicUser,
  getSession,
  getPatientSession,
  checkRateLimit,
  SESSION_COOKIE,
} from '@/lib/auth';
import type { User } from '@/types';

const mockQuery = jest.fn();
const mockQueryOne = jest.fn();

jest.mock('@/lib/db', () => ({
  query: (...a: unknown[]) => mockQuery(...a),
  queryOne: (...a: unknown[]) => mockQueryOne(...a),
}));

beforeEach(() => {
  mockQuery.mockReset();
  mockQueryOne.mockReset();
});

describe('password hashing', () => {
  it('hashes and verifies a password (bcrypt)', async () => {
    const hash = await hashPassword('SecurePass123!');
    expect(hash).not.toContain('SecurePass123!');
    expect(hash.startsWith('$2')).toBe(true);
    expect(await verifyPassword('SecurePass123!', hash)).toBe(true);
    expect(await verifyPassword('wrong', hash)).toBe(false);
  }, 20000);

  it('uses a cost factor of at least 12', async () => {
    const hash = await hashPassword('SecurePass123!');
    const cost = Number(hash.split('$')[2]);
    expect(cost).toBeGreaterThanOrEqual(12);
  }, 20000);
});

describe('email validation', () => {
  it.each(['a@b.co', 'patient@test.com', 'x.y+z@sub.domain.io'])('accepts %s', (e) => {
    expect(isValidEmail(e)).toBe(true);
  });
  it.each(['', 'no-at', 'a@b', 'a@@b.com', 'spaces @b.com'])('rejects %s', (e) => {
    expect(isValidEmail(e)).toBe(false);
  });
});

describe('password strength', () => {
  it('accepts a strong password', () => {
    expect(validatePasswordStrength('SecurePass123!').ok).toBe(true);
  });
  it.each([
    ['alllowercase1!', false],
    ['ALLUPPERCASE1!', false],
    ['NoNumber!', false],
    ['NoSymbol123', false],
    ['short', false],
    ['Str0ng!x', true],
  ])('evaluates %s', (pw, expected) => {
    expect(validatePasswordStrength(pw as string).ok).toBe(expected as boolean);
  });
});

describe('session tokens', () => {
  it('generates random hex tokens and hashes them deterministically', () => {
    const t1 = generateSessionToken();
    const t2 = generateSessionToken();
    expect(t1).toMatch(/^[0-9a-f]{64}$/);
    expect(t1).not.toBe(t2);
    expect(hashToken(t1)).toBe(hashToken(t1));
    expect(hashToken(t1)).not.toBe(t1);
  });

  it('constant-time compares equal/unequal strings', () => {
    expect(constantTimeEquals('abc', 'abc')).toBe(true);
    expect(constantTimeEquals('abc', 'abd')).toBe(false);
    expect(constantTimeEquals('abc', 'abcd')).toBe(false);
  });
});

describe('getSession', () => {
  it('returns null for an absent token without hitting the DB', async () => {
    expect(await getSession(undefined)).toBeNull();
    expect(mockQueryOne).not.toHaveBeenCalled();
  });

  it('returns null when the token is unknown or expired (query WHERE excludes it)', async () => {
    // The SQL filters expires_at > now(), so an expired/unknown token yields no row.
    mockQueryOne.mockResolvedValue(null);
    expect(await getSession('deadbeef')).toBeNull();
    expect(mockQueryOne).toHaveBeenCalled();
  });

  it('returns the session record for a live token', async () => {
    const record = { user_id: 'u1', account_type: 'patient', expires_at: 'later' };
    mockQueryOne.mockResolvedValue(record);
    expect(await getSession('livetoken')).toEqual(record);
  });
});

describe('getPatientSession', () => {
  const cookieGet = (val: string | undefined) => (name: string) =>
    name === SESSION_COOKIE ? val : undefined;

  it('returns null when there is no session', async () => {
    mockQueryOne.mockResolvedValue(null);
    expect(await getPatientSession(cookieGet('tok'))).toBeNull();
  });

  it('rejects a non-patient account_type replayed on the patient cookie', async () => {
    // A hospital/dev session token placed in the patient cookie must not resolve.
    mockQueryOne.mockResolvedValue({ user_id: 'u1', account_type: 'hospital_staff', expires_at: 'later' });
    expect(await getPatientSession(cookieGet('tok'))).toBeNull();
  });

  it('resolves a genuine patient session', async () => {
    mockQueryOne.mockResolvedValue({ user_id: 'u1', account_type: 'patient', expires_at: 'later' });
    expect(await getPatientSession(cookieGet('tok'))).toEqual(
      expect.objectContaining({ account_type: 'patient' }),
    );
  });
});

describe('checkRateLimit', () => {
  it('allows and records the attempt when under the limit', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ count: '4' }] }) // window count
      .mockResolvedValueOnce({ rows: [] }); // insert
    const allowed = await checkRateLimit('bucket', 5, 300);
    expect(allowed).toBe(true);
    // Two queries: the count SELECT and the recording INSERT.
    expect(mockQuery).toHaveBeenCalledTimes(2);
  });

  it('blocks and does NOT record once the count reaches the limit', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ count: '5' }] });
    const allowed = await checkRateLimit('bucket', 5, 300);
    expect(allowed).toBe(false);
    // Only the count SELECT ran; no INSERT recorded.
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });
});

describe('toPublicUser', () => {
  it('strips the password hash', () => {
    const user = {
      id: '1',
      email: 'a@b.co',
      password_hash: 'secret',
      account_type: 'patient',
    } as User;
    const pub = toPublicUser(user);
    expect('password_hash' in pub).toBe(false);
    expect(pub.email).toBe('a@b.co');
  });
});
