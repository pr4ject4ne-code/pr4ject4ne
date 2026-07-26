// Pure helpers for the mobile bottom-sheet drag-to-resize interaction
// (HomeClient.tsx's results panel). Kept dependency-free so the snap-point
// math can be unit-tested without rendering the full page (which pulls in
// Leaflet, geolocation, and fetch).

/** Sheet height as a fraction of the viewport when collapsed (default) vs.
 * expanded (dragged/toggled open). Fixed viewport-relative values rather
 * than a percentage of `.stage` — `.stage`'s own height changed once
 * already (100vh -> 80vh), and pinning the sheet's collapsed height to a
 * fraction of `.stage` would have silently re-shrunk it again. Deliberately
 * short of 100vh so a sliver of map stays visible while expanded. */
export const COLLAPSED_SHEET_VH = 46;
export const EXPANDED_SHEET_VH = 88;

export function sheetVhToPx(vh: number, viewportHeightPx: number): number {
  return (vh / 100) * viewportHeightPx;
}

/** Clamp a candidate sheet height (px) to the collapsed/expanded range. */
export function clampSheetHeightPx(
  candidatePx: number,
  viewportHeightPx: number,
  collapsedVh: number = COLLAPSED_SHEET_VH,
  expandedVh: number = EXPANDED_SHEET_VH,
): number {
  const min = sheetVhToPx(collapsedVh, viewportHeightPx);
  const max = sheetVhToPx(expandedVh, viewportHeightPx);
  return Math.min(max, Math.max(min, candidatePx));
}

/** A drag ending faster than this (px of height change per ms) is treated as
 * a deliberate flick — it snaps in the direction of travel even if the
 * pointer never crossed the midpoint. ~0.5px/ms is roughly 500px/s, a speed
 * a slow/considered drag won't reach but a real flick easily will. */
export const FLICK_VELOCITY_PX_PER_MS = 0.5;

/** Given the sheet's current height on pointer-release, decide which snap
 * point (collapsed/expanded) it should animate to. Velocity-aware: a fast
 * flick in either direction wins outright (matches the "grabbed and flicked"
 * gesture people actually use, not just "dragged past the midpoint") —
 * falls back to whichever snap point is nearer by position when the release
 * velocity is too small to count as a flick. `velocityPxPerMs` is signed the
 * same way height itself is: positive = growing (dragging toward expanded),
 * negative = shrinking (toward collapsed). Optional + defaulted to 0 so
 * existing position-only callers/tests keep working unchanged. */
export function resolveSheetSnap(
  currentHeightPx: number,
  viewportHeightPx: number,
  collapsedVh: number = COLLAPSED_SHEET_VH,
  expandedVh: number = EXPANDED_SHEET_VH,
  velocityPxPerMs: number = 0,
): boolean {
  if (velocityPxPerMs >= FLICK_VELOCITY_PX_PER_MS) return true;
  if (velocityPxPerMs <= -FLICK_VELOCITY_PX_PER_MS) return false;
  const collapsedPx = sheetVhToPx(collapsedVh, viewportHeightPx);
  const expandedPx = sheetVhToPx(expandedVh, viewportHeightPx);
  const midpoint = (collapsedPx + expandedPx) / 2;
  return currentHeightPx >= midpoint;
}
