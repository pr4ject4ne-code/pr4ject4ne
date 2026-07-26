import type { Metadata } from 'next';
import { headers } from 'next/headers';
import './globals.css';

export const metadata: Metadata = {
  title: 'Racoon Eye',
  description:
    'Discover hospitals, manage your health biodata securely, and access first-aid guidance.',
};

// Sets data-gfx-tier on <html> synchronously, before first paint — the
// same coarse heuristic GfxTier.tsx used to apply post-mount via useEffect,
// which caused a brief flash of full-cost glass on every load for low-tier
// devices (exactly the cost the fallback exists to avoid). A blocking
// inline script (no dynamic/user-controlled content, so no injection risk)
// runs during HTML parsing instead, same no-FOUC pattern libraries like
// next-themes use for dark-mode class toggling.
const GFX_TIER_SCRIPT = `
(function () {
  try {
    var nav = navigator;
    var lowCores = typeof nav.hardwareConcurrency === 'number' && nav.hardwareConcurrency <= 2;
    var lowMemory = typeof nav.deviceMemory === 'number' && nav.deviceMemory <= 4;
    var conn = nav.connection;
    var slowConnection = !!conn && (conn.saveData === true || conn.effectiveType === '2g' || conn.effectiveType === 'slow-2g');
    var isLowTier = slowConnection || lowCores || lowMemory;
    document.documentElement.setAttribute('data-gfx-tier', isLowTier ? 'low' : 'high');
  } catch (e) {}
})();
`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // This app's CSP (src/middleware.ts) is nonce-based with 'strict-dynamic' —
  // an inline <script> with no nonce is silently dropped by the browser, not
  // an error. The middleware forwards its per-request nonce via the x-nonce
  // request header specifically so server components can stamp it here.
  const nonce = (await headers()).get('x-nonce') ?? undefined;
  return (
    // suppressHydrationWarning is required here: the inline script below
    // sets data-gfx-tier on this element before React hydrates (that's the
    // whole point — no flash of un-tiered content), so server-rendered HTML
    // (no attribute) and the client's first hydration pass (attribute
    // already present) will always legitimately differ on this one
    // attribute. Same fix every no-FOUC library (next-themes etc.) uses.
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Browsers deliberately hide a script's `nonce` attribute/property
            from JS after the initial parse (a security measure so it can't
            be read and reused) — this makes React log a nonce="" vs
            nonce="<value>" hydration mismatch on this exact element on every
            load, which is a known, documented, harmless side effect of using
            nonce'd inline scripts, not a real bug. Suppressed at the element
            level only, not app-wide. */}
        <script nonce={nonce} suppressHydrationWarning dangerouslySetInnerHTML={{ __html: GFX_TIER_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
