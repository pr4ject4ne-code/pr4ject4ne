/**
 * Regression guard for the CSP-blocks-hydration P0.
 *
 * The app once shipped a static `script-src 'self'` CSP from next.config.mjs,
 * which blocked every inline bootstrap/hydration script Next emits — zero
 * client-side JS in dev AND production. These tests invoke the real middleware
 * against a mocked NextRequest and fail if the policy could ever regress to a
 * hydration-blocking shape:
 *   (a) script-src must carry a per-request 'nonce-…' (+ 'strict-dynamic'),
 *       never a bare 'self'-only list;
 *   (b) 'unsafe-eval' is dev-only and must NEVER appear in production.
 */
import { NextRequest } from 'next/server';
import { middleware } from '@/middleware';

function pageRequest(path = '/'): NextRequest {
  return new NextRequest(`http://localhost:3000${path}`);
}

/** Extract the script-src directive from a serialized CSP. */
function scriptSrcOf(csp: string): string {
  const directive = csp
    .split(';')
    .map((d) => d.trim())
    .find((d) => d.startsWith('script-src'));
  expect(directive).toBeDefined();
  return directive as string;
}

describe('middleware CSP (hydration regression guard)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('sets a CSP response header with a nonce + strict-dynamic in script-src', () => {
    const res = middleware(pageRequest());
    const csp = res.headers.get('content-security-policy');
    expect(csp).toBeTruthy();

    const scriptSrc = scriptSrcOf(csp as string);
    expect(scriptSrc).toMatch(/'nonce-[A-Za-z0-9+/=]+'/);
    expect(scriptSrc).toContain("'strict-dynamic'");
    // The exact policy that shipped broken: scripts locked to 'self' with no
    // nonce, which blocks Next's inline bootstrap scripts.
    expect(scriptSrc).not.toMatch(/^script-src 'self'$/);
    expect(scriptSrc).not.toContain("'self'");
  });

  it('forwards the same nonce to Next via the x-nonce request header', () => {
    const res = middleware(pageRequest());
    const csp = res.headers.get('content-security-policy') as string;
    const nonce = /'nonce-([^']+)'/.exec(csp)?.[1];
    expect(nonce).toBeTruthy();

    // NextResponse.next({ request }) records overridden request headers as
    // x-middleware-request-* response headers — assert the forwarded pair.
    expect(res.headers.get('x-middleware-request-x-nonce')).toBe(nonce);
    expect(res.headers.get('x-middleware-request-content-security-policy')).toBe(csp);
  });

  it('generates a fresh nonce per request', () => {
    const first = middleware(pageRequest()).headers.get('content-security-policy');
    const second = middleware(pageRequest()).headers.get('content-security-policy');
    expect(first).not.toBe(second);
  });

  it('preserves the MapTiler/OSM/OSRM allowances and hardening directives', () => {
    const csp = middleware(pageRequest()).headers.get('content-security-policy') as string;
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("style-src 'self' 'unsafe-inline'");
    expect(csp).toContain("worker-src 'self' blob:");
    expect(csp).toContain(
      "img-src 'self' data: blob: https://api.maptiler.com https://*.tile.openstreetmap.org https://unpkg.com"
    );
    expect(csp).toContain(
      "connect-src 'self' https://api.maptiler.com https://router.project-osrm.org https://*.tile.openstreetmap.org"
    );
    expect(csp).toContain("font-src 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
  });

  it("includes 'unsafe-eval' outside production (Next dev tooling needs it)", () => {
    // Jest runs with NODE_ENV=test, which takes the non-production branch.
    const csp = middleware(pageRequest()).headers.get('content-security-policy') as string;
    expect(scriptSrcOf(csp)).toContain("'unsafe-eval'");
  });

  it("NEVER includes 'unsafe-eval' in production", () => {
    jest.replaceProperty(process.env, 'NODE_ENV', 'production');
    const csp = middleware(pageRequest()).headers.get('content-security-policy') as string;
    expect(csp).not.toContain("'unsafe-eval'");
    // Still nonce-based in production.
    expect(scriptSrcOf(csp)).toMatch(/'nonce-[A-Za-z0-9+/=]+'/);
  });
});
