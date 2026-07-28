'use client';

/**
 * Founder bug report: an action button clicked after a session has expired
 * (or a stale tab that was never signed in) surfaced the raw "Not
 * authenticated." string as an inline error with no way back to a login
 * screen. Every action fetch in the dev/hospital portals (i.e. every fetch
 * beyond the page's own initial useDevGuard()/session-check load, which
 * already redirects correctly on a 401) needs this same 401 handling —
 * this is the shared wrapper so it's implemented once, not per file.
 *
 * Deliberately a plain async function, not a hook — most call sites are
 * `async function moderate(...)`-style handlers inside components, not
 * hook bodies, so it can't rely on `useRouter()`. `window.location.href` is
 * a full navigation and works from anywhere.
 */

export const SESSION_EXPIRED_MESSAGE = 'Your session has expired — redirecting to sign in…';

const DEFAULT_REDIRECT_DELAY_MS = 1200;

export interface AuthFetchOptions {
  /** Called once, synchronously, when the response is a 401 — use it to show
   * a "session expired" notice (e.g. via a component's existing error/notice
   * state setter) before the redirect fires, rather than jumping the user
   * away with no explanation. */
  onUnauthenticated?: (message: string) => void;
  /** Override navigation instead of a full page redirect to /login (e.g. to
   * pass a Next.js router's push for a client-side transition). */
  redirect?: () => void;
  /** Delay (ms) before navigating, so the message set via onUnauthenticated
   * is actually visible rather than an instant, jarring redirect. */
  redirectDelayMs?: number;
}

function defaultRedirect() {
  if (typeof window !== 'undefined') window.location.href = '/login';
}

/**
 * fetch() wrapper for authenticated action calls. Behaves exactly like fetch
 * for any non-401 response (ok or a real application error) — callers keep
 * their existing `if (!res.ok) ...` handling unchanged. On a 401, it fires
 * `onUnauthenticated` with a session-expired message and schedules a redirect
 * to /login; callers should short-circuit on `res.status === 401` before
 * parsing/displaying the response body, since that body's raw error string
 * ("Not authenticated.") is not meant to reach the user directly.
 */
export async function authFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
  options?: AuthFetchOptions,
): Promise<Response> {
  const res = await fetch(input, init);
  if (res.status === 401) {
    options?.onUnauthenticated?.(SESSION_EXPIRED_MESSAGE);
    const doRedirect = options?.redirect ?? defaultRedirect;
    const delay = options?.redirectDelayMs ?? DEFAULT_REDIRECT_DELAY_MS;
    setTimeout(doRedirect, delay);
  }
  return res;
}
