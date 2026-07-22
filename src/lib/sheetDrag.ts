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

/** Given the sheet's current height on pointer-release, decide which snap
 * point (collapsed/expanded) it should animate to — whichever is nearer. */
export function resolveSheetSnap(
  currentHeightPx: number,
  viewportHeightPx: number,
  collapsedVh: number = COLLAPSED_SHEET_VH,
  expandedVh: number = EXPANDED_SHEET_VH,
): boolean {
  const collapsedPx = sheetVhToPx(collapsedVh, viewportHeightPx);
  const expandedPx = sheetVhToPx(expandedVh, viewportHeightPx);
  const midpoint = (collapsedPx + expandedPx) / 2;
  return currentHeightPx >= midpoint;
}
