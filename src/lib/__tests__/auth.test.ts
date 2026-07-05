import {
  hashPassword,
  verifyPassword,
  isValidEmail,
  validatePasswordStrength,
  generateSessionToken,
  hashToken,
  constantTimeEquals,
  toPublicUser,
} from '@/lib/auth';
import type { User } from '@/types';

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
