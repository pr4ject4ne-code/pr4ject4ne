'use client';

import { useEffect } from 'react';

/**
 * Coarse device-tier heuristic for `backdrop-filter` cost (worklist #1 /
 * research finding #7 — stacked/complex blur is a documented real perf cost,
 * and this app has no frame-rate-sampling infra to do anything fancier).
 * Deliberately simple: `navigator.hardwareConcurrency` (logical CPU cores)
 * plus, where available, the Network Information API's `saveData`/
 * `effectiveType` — both are cheap, synchronous-ish reads with no
 * permission prompt, unlike an actual rAF frame-timing probe which would be
 * overkill for this pass. Sets `data-gfx-tier="low"` on <html> so plain CSS
 * (globals.css, HomeClient.module.css) can cap blur radius/drop the SVG
 * refraction filter for that tier — no JS-driven style writes, no per-frame
 * cost, just a one-time classification at mount.
 */
export default function GfxTier() {
  useEffect(() => {
    const nav = navigator as Navigator & {
      connection?: { saveData?: boolean; effectiveType?: string };
      deviceMemory?: number;
    };
    const lowCores = typeof nav.hardwareConcurrency === 'number' && nav.hardwareConcurrency <= 4;
    const lowMemory = typeof nav.deviceMemory === 'number' && nav.deviceMemory <= 4;
    const conn = nav.connection;
    const slowConnection =
      conn?.saveData === true || conn?.effectiveType === '2g' || conn?.effectiveType === 'slow-2g';
    const isLowTier = slowConnection || lowCores || lowMemory;
    document.documentElement.setAttribute('data-gfx-tier', isLowTier ? 'low' : 'high');
  }, []);

  return null;
}
