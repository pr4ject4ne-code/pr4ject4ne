import LogoLoader from '@/components/LogoLoader';

/**
 * Next.js App Router route-transition loading UI (founder ask, 2026-07-26:
 * "custom loading" using the brand mark) — shown automatically while a page
 * segment is loading.
 */
export default function RootLoading() {
  return <LogoLoader />;
}
