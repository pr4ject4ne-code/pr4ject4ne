/** @type {import('next').NextConfig} */

// Content-Security-Policy. Tightest policy compatible with the app: same-origin
// scripts/styles, plus the OpenStreetMap tile hosts and OSRM routing host the
// Leaflet map needs. 'unsafe-inline' for styles is required by Leaflet + CSS
// modules; scripts stay locked to 'self'. This is the backstop for any URL sink
// that slips a bad value through (see safeHttpUrl in lib/sanitize).
const csp = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https://*.tile.openstreetmap.org https://unpkg.com",
  "connect-src 'self' https://router.project-osrm.org https://*.tile.openstreetmap.org",
  "font-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

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
          { key: 'Content-Security-Policy', value: csp },
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
