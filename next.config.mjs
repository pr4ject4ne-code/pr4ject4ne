/** @type {import('next').NextConfig} */

// NOTE: the Content-Security-Policy is NOT set here. A static CSP would block
// Next's inline bootstrap/hydration scripts (`script-src 'self'` did exactly
// that — P0). It is set per-request with a fresh nonce in src/middleware.ts,
// the single source of CSP truth.

const isProd = process.env.NODE_ENV === 'production';

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value: 'geolocation=(self), camera=(), microphone=()',
          },
          // HSTS only in production (would break local http dev).
          ...(isProd
            ? [
                {
                  key: 'Strict-Transport-Security',
                  value: 'max-age=63072000; includeSubDomains; preload',
                },
              ]
            : []),
        ],
      },
    ];
  },
};

export default nextConfig;
