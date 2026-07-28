/**
 * Tests for patient-personal calendar reminders (/api/reminders, founder ask —
 * not a numbered worklist item). Ownership scoping mirrors this project's
 * existing isolation-test rigor (see hospital-isolation.test.ts): a DIFFERENT
 * user must never be able to see or delete another user's reminders.
 */
import { GET, POST } from '@/app/api/reminders/route';
import { DELETE } from '@/app/api/reminders/[id]/route';

const mockGetPatientSession = jest.fn();
const mockQuery = jest.fn();
const mockQueryOne = jest.fn();
const mockCheckRateLimit = jest.fn().mockResolvedValue(true);

jest.mock('next/headers', () => ({
  cookies: () => ({ get: () => ({ value: 'session-token' }) }),
}));

jest.mock('@/lib/auth', () => {
  const actual = jest.requireActual('@/lib/auth');
  return {
    ...actual,
    getPatientSession: (...a: unknown[]) => mockGetPatientSession(...a),
    checkRateLimit: (...a: unknown[]) => mockCheckRateLimit(...a),
  };
});

jest.mock('@/lib/db', () => ({
  query: (...a: unknown[]) => mockQuery(...a),
  queryOne: (...a: unknown[]) => mockQueryOne(...a),
}));

jest.mock('@/lib/audit', () => ({
  logAudit: jest.fn().mockResolvedValue(undefined),
  clientIpFrom: () => null,
}));

const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '22222222-2222-4222-8222-222222222222';
const REMINDER_A = '33333333-3333-4333-8333-333333333333';

function session(userId: string | null) {
  mockGetPatientSession.mockResolvedValue(userId ? { user_id: userId, account_type: 'patient' } : null);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockCheckRateLimit.mockResolvedValue(true);
  mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
});

describe('GET /api/reminders', () => {
  it('401 without a session', async () => {
    session(null);
    const res = await GET(new Request('http://localhost/api/reminders'));
    expect(res.status).toBe(401);
  });

  it('returns only the caller own reminders, scoped by user_id in the query', async () => {
    session(USER_A);
    mockQuery.mockResolvedValue({
      rows: [{ id: REMINDER_A, user_id: USER_A, title: 'Follow-up', note: null, remind_at: '2026-08-01T09:00:00.000Z', created_at: '2026-07-28T00:00:00.000Z' }],
    });
    const res = await GET(new Request('http://localhost/api/reminders'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.reminders).toHaveLength(1);
    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('WHERE user_id = $1');
    expect(params).toEqual([USER_A]);
  });
});

describe('POST /api/reminders', () => {
  function req(body: unknown): Request {
    return new Request('http://localhost/api/reminders', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  it('401 without a session', async () => {
    session(null);
    const res = await POST(req({ title: 'x', remind_at: '2026-08-01T09:00:00.000Z' }));
    expect(res.status).toBe(401);
  });

  it('429 when the per-user creation rate limit is hit', async () => {
    session(USER_A);
    mockCheckRateLimit.mockResolvedValue(false);
    const res = await POST(req({ title: 'x', remind_at: '2026-08-01T09:00:00.000Z' }));
    expect(res.status).toBe(429);
  });

  it('400 without a title', async () => {
    session(USER_A);
    const res = await POST(req({ remind_at: '2026-08-01T09:00:00.000Z' }));
    expect(res.status).toBe(400);
  });

  it('400 with an unparsable remind_at', async () => {
    session(USER_A);
    const res = await POST(req({ title: 'Take meds', remind_at: 'not-a-date' }));
    expect(res.status).toBe(400);
  });

  it('escapes HTML in title/note and creates the reminder for the caller', async () => {
    session(USER_A);
    mockQueryOne.mockResolvedValue({ count: '0' });
    mockQuery.mockResolvedValue({
      rows: [{ id: REMINDER_A, created_at: '2026-07-28T00:00:00.000Z' }],
    });
    const res = await POST(
      req({ title: '<b>Checkup</b>', note: '<i>bring card</i>', remind_at: '2026-08-01T09:00:00.000Z' }),
    );
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.reminder.title).toBe('&lt;b&gt;Checkup&lt;/b&gt;');
    expect(json.reminder.note).toBe('&lt;i&gt;bring card&lt;/i&gt;');
    expect(json.reminder.user_id).toBe(USER_A);
    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('INSERT INTO reminders');
    expect(params[0]).toBe(USER_A);
  });

  it('400 when the caller is already at the per-user reminder cap', async () => {
    session(USER_A);
    mockQueryOne.mockResolvedValue({ count: '500' });
    const res = await POST(req({ title: 'One more', remind_at: '2026-08-01T09:00:00.000Z' }));
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('LIMIT_REACHED');
    expect(mockQuery.mock.calls.some(([sql]: [string]) => sql.includes('INSERT INTO reminders'))).toBe(false);
  });
});

describe('DELETE /api/reminders/[id]', () => {
  function delReq(id: string): Request {
    return new Request(`http://localhost/api/reminders/${id}`, { method: 'DELETE' });
  }

  it('401 without a session', async () => {
    session(null);
    const res = await DELETE(delReq(REMINDER_A), { params: Promise.resolve({ id: REMINDER_A }) });
    expect(res.status).toBe(401);
  });

  it('404 for a malformed id (no query issued)', async () => {
    session(USER_A);
    const res = await DELETE(delReq('not-a-uuid'), { params: Promise.resolve({ id: 'not-a-uuid' }) });
    expect(res.status).toBe(404);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('deletes when the caller owns the reminder, scoped by id AND user_id', async () => {
    session(USER_A);
    mockQuery.mockResolvedValue({ rowCount: 1 });
    const res = await DELETE(delReq(REMINDER_A), { params: Promise.resolve({ id: REMINDER_A }) });
    expect(res.status).toBe(200);
    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('user_id = $2');
    expect(params).toEqual([REMINDER_A, USER_A]);
  });

  it("404 when user B tries to delete user A's reminder (isolation, not a cross-user 200)", async () => {
    session(USER_B);
    // The scoped WHERE (id AND user_id) matches zero rows for a foreign id.
    mockQuery.mockResolvedValue({ rowCount: 0 });
    const res = await DELETE(delReq(REMINDER_A), { params: Promise.resolve({ id: REMINDER_A }) });
    expect(res.status).toBe(404);
    const [, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    // Proves the delete was actually attempted scoped to user B, not user A.
    expect(params).toEqual([REMINDER_A, USER_B]);
  });
});
