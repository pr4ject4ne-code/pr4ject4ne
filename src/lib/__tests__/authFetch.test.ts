import { authFetch, SESSION_EXPIRED_MESSAGE } from '@/lib/authFetch';

describe('authFetch', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.useRealTimers();
  });

  it('passes a non-401 response through unchanged and never redirects', async () => {
    const okResponse = new Response(JSON.stringify({ ok: true }), { status: 200 });
    global.fetch = jest.fn().mockResolvedValue(okResponse);
    const redirect = jest.fn();
    const onUnauthenticated = jest.fn();

    const res = await authFetch('/api/dev/hospitals', { method: 'POST' }, { redirect, onUnauthenticated });

    expect(res).toBe(okResponse);
    expect(res.status).toBe(200);
    expect(onUnauthenticated).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it('passes a non-401 error response through unchanged and never redirects', async () => {
    const errResponse = new Response(JSON.stringify({ error: 'Bad input.' }), { status: 400 });
    global.fetch = jest.fn().mockResolvedValue(errResponse);
    const redirect = jest.fn();

    const res = await authFetch('/api/dev/hospitals', undefined, { redirect });

    expect(res.status).toBe(400);
    expect(redirect).not.toHaveBeenCalled();
  });

  it('on a 401, calls onUnauthenticated with the session-expired message and schedules a redirect', async () => {
    jest.useFakeTimers();
    const unauthResponse = new Response(JSON.stringify({ error: 'Not authenticated.' }), { status: 401 });
    global.fetch = jest.fn().mockResolvedValue(unauthResponse);
    const redirect = jest.fn();
    const onUnauthenticated = jest.fn();

    const res = await authFetch('/api/dev/hospitals', undefined, { redirect, onUnauthenticated, redirectDelayMs: 1000 });

    expect(res.status).toBe(401);
    expect(onUnauthenticated).toHaveBeenCalledWith(SESSION_EXPIRED_MESSAGE);
    expect(redirect).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1000);
    expect(redirect).toHaveBeenCalledTimes(1);
  });

  it('on a 401 with no options, still schedules a default redirect without throwing', async () => {
    jest.useFakeTimers();
    const unauthResponse = new Response(null, { status: 401 });
    global.fetch = jest.fn().mockResolvedValue(unauthResponse);

    const res = await authFetch('/api/dev/hospitals');
    expect(res.status).toBe(401);

    // Default delay elapses without error even though no redirect override was given
    // (window.location.href assignment is a no-op safety-checked branch in jsdom/node).
    expect(() => jest.advanceTimersByTime(1500)).not.toThrow();
  });
});
