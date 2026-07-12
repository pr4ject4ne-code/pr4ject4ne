/**
 * Unit tests for developer session resolution and admin gating. We stub the
 * @/lib/auth boundary (getSession / findUserById) that dev-auth calls across a
 * module boundary, plus next/headers cookies(), and exercise the real dev-auth
 * logic: only account_type 'developer', active accounts, and live sessions pass;
 * level helpers reflect the primary/secondary model.
 */
import { getDevSession, getDevUser, isPrimary, isSecondary, isAdmin } from '@/lib/dev-auth';
import type { User } from '@/types';

const mockGetSession = jest.fn();
const mockFindUserById = jest.fn();

jest.mock('next/headers', () => ({
  cookies: () => ({ get: () => ({ value: 'dev-token' }), delete: jest.fn() }),
}));

jest.mock('@/lib/auth', () => {
  const actual = jest.requireActual('@/lib/auth');
  return {
    ...actual,
    getSession: (...a: unknown[]) => mockGetSession(...a),
    findUserById: (...a: unknown[]) => mockFindUserById(...a),
  };
});

function devUser(overrides: Partial<User> = {}): User {
  return {
    id: 'dev-1',
    email: 'dev@test.com',
    account_type: 'developer',
    is_active: true,
    access_level: 'secondary',
    ...overrides,
  } as User;
}

beforeEach(() => jest.clearAllMocks());

describe('getDevSession', () => {
  it('returns null when there is no live session', async () => {
    mockGetSession.mockResolvedValue(null);
    expect(await getDevSession()).toBeNull();
  });

  it('rejects a non-developer account_type (e.g. a patient token on the dev cookie)', async () => {
    mockGetSession.mockResolvedValue({ user_id: 'x', account_type: 'patient', expires_at: 'later' });
    expect(await getDevSession()).toBeNull();
  });

  it('returns the session for a developer account_type', async () => {
    const session = { user_id: 'dev-1', account_type: 'developer', expires_at: 'later' };
    mockGetSession.mockResolvedValue(session);
    expect(await getDevSession()).toEqual(session);
  });
});

describe('getDevUser', () => {
  it('returns null when the session is absent/expired', async () => {
    mockGetSession.mockResolvedValue(null);
    expect(await getDevUser()).toBeNull();
    expect(mockFindUserById).not.toHaveBeenCalled();
  });

  it('returns null when the user is inactive', async () => {
    mockGetSession.mockResolvedValue({ user_id: 'dev-1', account_type: 'developer', expires_at: 'later' });
    mockFindUserById.mockResolvedValue(devUser({ is_active: false }));
    expect(await getDevUser()).toBeNull();
  });

  it('returns null when the user is no longer a developer', async () => {
    mockGetSession.mockResolvedValue({ user_id: 'dev-1', account_type: 'developer', expires_at: 'later' });
    mockFindUserById.mockResolvedValue(devUser({ account_type: 'patient' }));
    expect(await getDevUser()).toBeNull();
  });

  it('returns the developer user for a valid active developer session', async () => {
    mockGetSession.mockResolvedValue({ user_id: 'dev-1', account_type: 'developer', expires_at: 'later' });
    const user = devUser();
    mockFindUserById.mockResolvedValue(user);
    expect(await getDevUser()).toEqual(user);
  });
});

describe('level helpers', () => {
  it('isPrimary is true only for access_level primary', () => {
    expect(isPrimary(devUser({ access_level: 'primary' }))).toBe(true);
    expect(isPrimary(devUser({ access_level: 'secondary' }))).toBe(false);
    expect(isPrimary(devUser({ access_level: undefined }))).toBe(false);
  });

  it('isSecondary is true only for access_level secondary', () => {
    expect(isSecondary(devUser({ access_level: 'secondary' }))).toBe(true);
    expect(isSecondary(devUser({ access_level: 'primary' }))).toBe(false);
  });

  it('isAdmin is a back-compat alias for primary', () => {
    expect(isAdmin(devUser({ access_level: 'primary' }))).toBe(true);
    expect(isAdmin(devUser({ access_level: 'secondary' }))).toBe(false);
  });
});
