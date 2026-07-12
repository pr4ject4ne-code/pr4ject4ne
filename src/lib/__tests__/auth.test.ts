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
  // checkRateLimit runs inside a transaction guarded by an advisory lock; route
  // the scoped tx.query to the same mock so call assertions still work.
  withTransaction: (fn: (tx: { query: (...a: unknown[]) => unknown }) => unknown) =>
    fn({ query: (...a: unknown[]) => mockQuery(...a) }),
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
    const record = sessionRow(20 * 60 * 1000, -60 * 1000); // 20 min left, 1 min old
    mockQueryOne.mockResolvedValue(record);
    expect(await getSession('livetoken')).toEqual(record);
  });
});

/** Session row with expires_at now+expiresInMs and created_at now+createdOffsetMs. */
function sessionRow(expiresInMs: number, createdOffsetMs: number) {
  return {
    user_id: 'u1',
    account_type: 'patient',
    expires_at: new Date(Date.now() + expiresInMs).toISOString(),
    created_at: new Date(Date.now() + createdOffsetMs).toISOString(),
  };
}

describe('getSession sliding expiry', () => {
  it('extends a session that is within 15 minutes of expiring', async () => {
    // 5 min left, created 25 min ago — well under the 12h absolute cap.
    mockQueryOne.mockResolvedValue(sessionRow(5 * 60 * 1000, -25 * 60 * 1000));
    mockQuery.mockResolvedValue({ rows: [] });

    const session = await getSession('livetoken');
    expect(session).not.toBeNull();
    expect(mockQuery).toHaveBeenCalledTimes(1);
    const [sql] = mockQuery.mock.calls[0];
    expect(sql).toContain('UPDATE sessions');
    expect(sql).toContain(`LEAST(now() + interval '30 minutes', created_at + interval '12 hours')`);
    // Returned expiry reflects the extension (~30 min out).
    const newExpiry = new Date(session!.expires_at).getTime();
    expect(newExpiry).toBeGreaterThan(Date.now() + 25 * 60 * 1000);
  });

  it('does NOT write when the session is not near expiry', async () => {
    // 25 min left — above the 15-min renewal threshold, so no UPDATE.
    mockQueryOne.mockResolvedValue(sessionRow(25 * 60 * 1000, -5 * 60 * 1000));
    const session = await getSession('livetoken');
    expect(session).not.toBeNull();
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('caps the extension at created_at + 12 hours', async () => {
    // Created 11h50m ago with 5 min left: cap = created + 12h = now + 10 min,
    // so the extension lands on the cap instead of now + 30 min.
    mockQueryOne.mockResolvedValue(
      sessionRow(5 * 60 * 1000, -(11 * 60 + 50) * 60 * 1000),
    );
    mockQuery.mockResolvedValue({ rows: [] });

    const session = await getSession('livetoken');
    expect(mockQuery).toHaveBeenCalledTimes(1);
    const newExpiry = new Date(session!.expires_at).getTime();
    // Roughly now + 10 min (the cap), definitely nowhere near now + 30 min.
    expect(newExpiry).toBeLessThanOrEqual(Date.now() + 10 * 60 * 1000 + 5000);
    expect(newExpiry).toBeGreaterThan(Date.now() + 8 * 60 * 1000);
  });

  it('does NOT write when the session already sits at its absolute cap', async () => {
    // expires_at == created_at + 12h exactly: extension can't move it, so no UPDATE.
    const now = Date.now();
    mockQueryOne.mockResolvedValue({
      user_id: 'u1',
      account_type: 'patient',
      expires_at: new Date(now + 5 * 60 * 1000).toISOString(),
      created_at: new Date(now + 5 * 60 * 1000 - 12 * 60 * 60 * 1000).toISOString(),
    });
    const session = await getSession('livetoken');
    expect(session).not.toBeNull();
    expect(mockQuery).not.toHaveBeenCalled();
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

  it('rejects a session whose patient account is deactivated', async () => {
    mockQueryOne
      .mockResolvedValueOnce({ user_id: 'u1', account_type: 'patient', expires_at: 'later' }) // session
      .mockResolvedValueOnce({ id: 'u1', account_type: 'patient', is_active: false }); // user
    expect(await getPatientSession(cookieGet('tok'))).toBeNull();
  });

  it('resolves a genuine patient session backed by an active user', async () => {
    mockQueryOne
      .mockResolvedValueOnce({ user_id: 'u1', account_type: 'patient', expires_at: 'later' }) // session
      .mockResolvedValueOnce({ id: 'u1', account_type: 'patient', is_active: true }); // user
    expect(await getPatientSession(cookieGet('tok'))).toEqual(
      expect.objectContaining({ account_type: 'patient' }),
    );
  });
});

describe('checkRateLimit', () => {
  let randomSpy: jest.SpyInstance;
  beforeEach(() => {
    // Pin Math.random above the sweep probability so the probabilistic global
    // GC never fires — keeps the query count deterministic for these assertions.
    randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0.99);
  });
  afterEach(() => randomSpy.mockRestore());

  it('takes the per-bucket advisory lock before counting', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] }) // advisory lock
      .mockResolvedValueOnce({ rows: [{ count: '0' }] }) // window count
      .mockResolvedValueOnce({ rows: [] }) // insert
      .mockResolvedValueOnce({ rows: [] }); // prune
    await checkRateLimit('bucket', 5, 300);
    const [lockSql, lockParams] = mockQuery.mock.calls[0];
    expect(lockSql).toContain('pg_advisory_xact_lock');
    expect(lockParams).toEqual(['bucket']);
  });

  it('allows, records the attempt, and prunes aged-out rows when under the limit', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] }) // advisory lock
      .mockResolvedValueOnce({ rows: [{ count: '4' }] }) // window count
      .mockResolvedValueOnce({ rows: [] }) // insert
      .mockResolvedValueOnce({ rows: [] }); // prune
    const allowed = await checkRateLimit('bucket', 5, 300);
    expect(allowed).toBe(true);
    // Four queries: advisory lock, count SELECT, recording INSERT, pruning DELETE.
    expect(mockQuery).toHaveBeenCalledTimes(4);
    const [pruneSql, pruneParams] = mockQuery.mock.calls[3];
    expect(pruneSql).toContain('DELETE FROM rate_limit_events');
    expect(pruneSql).toContain('bucket_key = $1');
    expect(pruneSql).toContain(`created_at <= now() - ($2 || ' seconds')::interval`);
    expect(pruneParams).toEqual(['bucket', '300']);
  });

  it('blocks and does NOT record or prune once the count reaches the limit', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] }) // advisory lock
      .mockResolvedValueOnce({ rows: [{ count: '5' }] }); // count
    const allowed = await checkRateLimit('bucket', 5, 300);
    expect(allowed).toBe(false);
    // Only the lock + count SELECT ran; no INSERT recorded, no DELETE issued.
    expect(mockQuery).toHaveBeenCalledTimes(2);
  });

  it('runs the global sweep when the dice fall below the sweep probability', async () => {
    randomSpy.mockReturnValue(0); // force the sweep
    mockQuery
      .mockResolvedValueOnce({ rows: [] }) // advisory lock
      .mockResolvedValueOnce({ rows: [{ count: '0' }] }) // window count
      .mockResolvedValueOnce({ rows: [] }) // insert
      .mockResolvedValueOnce({ rows: [] }) // per-bucket prune
      .mockResolvedValueOnce({ rows: [] }); // global sweep
    await checkRateLimit('bucket', 5, 300);
    expect(mockQuery).toHaveBeenCalledTimes(5);
    const [sweepSql] = mockQuery.mock.calls[4];
    expect(sweepSql).toContain('DELETE FROM rate_limit_events');
    expect(sweepSql).not.toContain('bucket_key');
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
