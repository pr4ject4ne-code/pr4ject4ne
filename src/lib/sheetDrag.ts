// Pure helpers for the mobile bottom-sheet drag-to-resize interaction
// (HomeClient.tsx's results panel). Kept dependency-free so the snap-point
// math can be unit-tested without rendering the full page (which pulls in
// Leaflet, geolocation, and fetch).

/** Sheet height as a fraction of the viewport for each snap state: minimized
 * (just the grabber + heading strip, so the map behind it is almost fully
 * visible — founder ask, 2026-07-28: "minimizable to be able to see the full
 * map"), collapsed (the default resting state), and expanded (dragged/
 * toggled open). Fixed viewport-relative values rather than a percentage of
 * `.stage` — `.stage`'s own height changed once already (100vh -> 80vh), and
 * pinning the sheet's collapsed height to a fraction of `.stage` would have
 * silently re-shrunk it again. Expanded is deliberately short of 100vh so a
 * sliver of map stays visible while expanded. */
export const MINIMIZED_SHEET_VH = 12;
export const COLLAPSED_SHEET_VH = 46;
export const EXPANDED_SHEET_VH = 88;

export type SheetSnapState = 'minimized' | 'collapsed' | 'expanded';

export function sheetVhToPx(vh: number, viewportHeightPx: number): number {
  return (vh / 100) * viewportHeightPx;
}

/** Clamp a candidate sheet height (px) to the minimized/expanded range —
 * the full drag travel now spans minimized..expanded, with collapsed as a
 * snap point in between rather than the floor. */
export function clampSheetHeightPx(
  candidatePx: number,
  viewportHeightPx: number,
  minimizedVh: number = MINIMIZED_SHEET_VH,
  expandedVh: number = EXPANDED_SHEET_VH,
): number {
  const min = sheetVhToPx(minimizedVh, viewportHeightPx);
  const max = sheetVhToPx(expandedVh, viewportHeightPx);
  return Math.min(max, Math.max(min, candidatePx));
}

/** A drag ending faster than this (px of height change per ms) is treated as
 * a deliberate flick — it snaps in the direction of travel even if the
 * pointer never crossed the midpoint. ~0.5px/ms is roughly 500px/s, a speed
 * a slow/considered drag won't reach but a real flick easily will. */
export const FLICK_VELOCITY_PX_PER_MS = 0.5;

/** Given the sheet's current height on pointer-release, decide which of the
 * three snap points (minimized/collapsed/expanded) it should animate to.
 * Velocity-aware: a fast flick wins outright in its direction (matches the
 * "grabbed and flicked" gesture people actually use, not just "dragged past
 * the midpoint") — an upward flick always resolves to expanded, a downward
 * flick always resolves to minimized (a flick's whole point is skipping past
 * the middle snap point in one gesture). Below the flick threshold, falls
 * back to whichever of the three snap points is nearest by position.
 * `velocityPxPerMs` is signed the same way height itself is: positive =
 * growing (dragging toward expanded), negative = shrinking (toward
 * minimized). Optional + defaulted to 0 so position-only callers keep
 * working unchanged. */
export function resolveSheetSnap(
  currentHeightPx: number,
  viewportHeightPx: number,
  minimizedVh: number = MINIMIZED_SHEET_VH,
  expandedVh: number = EXPANDED_SHEET_VH,
  velocityPxPerMs: number = 0,
  collapsedVh: number = COLLAPSED_SHEET_VH,
): SheetSnapState {
  if (velocityPxPerMs >= FLICK_VELOCITY_PX_PER_MS) return 'expanded';
  if (velocityPxPerMs <= -FLICK_VELOCITY_PX_PER_MS) return 'minimized';
  const minimizedPx = sheetVhToPx(minimizedVh, viewportHeightPx);
  const collapsedPx = sheetVhToPx(collapsedVh, viewportHeightPx);
  const expandedPx = sheetVhToPx(expandedVh, viewportHeightPx);
  const distances: Array<[SheetSnapState, number]> = [
    ['minimized', Math.abs(currentHeightPx - minimizedPx)],
    ['collapsed', Math.abs(currentHeightPx - collapsedPx)],
    ['expanded', Math.abs(currentHeightPx - expandedPx)],
  ];
  distances.sort((a, b) => a[1] - b[1]);
  return distances[0][0];
}
