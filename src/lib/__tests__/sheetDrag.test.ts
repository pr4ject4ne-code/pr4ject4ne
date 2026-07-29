import {
  clampSheetHeightPx,
  resolveSheetSnap,
  sheetVhToPx,
  MINIMIZED_SHEET_VH,
  COLLAPSED_SHEET_VH,
  EXPANDED_SHEET_VH,
  FLICK_VELOCITY_PX_PER_MS,
} from '@/lib/sheetDrag';

// Pure-function coverage for the mobile bottom-sheet drag-to-resize math.
// The interaction itself (Pointer Events on the grabber in HomeClient.tsx)
// isn't unit-tested directly — that component pulls in Leaflet/geolocation/
// fetch and would need a heavy mock harness to render at all, and the actual
// pointer-drag behavior is a DOM/gesture concern best caught by a real
// browser check, not jsdom. This covers the part that's actually meaningful
// to pin down: clamping and snap-point selection, i.e. "does a simulated
// pointer sequence land in the right minimized/collapsed/expanded state".
describe('sheetDrag', () => {
  const viewportHeight = 800;

  it('converts vh to px against the given viewport height', () => {
    expect(sheetVhToPx(50, 800)).toBe(400);
    expect(sheetVhToPx(COLLAPSED_SHEET_VH, 1000)).toBeCloseTo(460);
  });

  it('clamps a candidate height to the minimized floor', () => {
    const minimizedPx = sheetVhToPx(MINIMIZED_SHEET_VH, viewportHeight);
    expect(clampSheetHeightPx(0, viewportHeight)).toBe(minimizedPx);
    expect(clampSheetHeightPx(-500, viewportHeight)).toBe(minimizedPx);
  });

  it('clamps a candidate height to the expanded ceiling', () => {
    const expandedPx = sheetVhToPx(EXPANDED_SHEET_VH, viewportHeight);
    expect(clampSheetHeightPx(viewportHeight * 2, viewportHeight)).toBe(expandedPx);
  });

  it('leaves an in-range candidate untouched', () => {
    const midway = sheetVhToPx(60, viewportHeight);
    expect(clampSheetHeightPx(midway, viewportHeight)).toBe(midway);
  });

  it('snaps to minimized when dragged only slightly past the floor', () => {
    const nearMinimized = sheetVhToPx(MINIMIZED_SHEET_VH + 1, viewportHeight);
    expect(resolveSheetSnap(nearMinimized, viewportHeight)).toBe('minimized');
  });

  it('snaps to collapsed when released near the collapsed snap point', () => {
    const nearCollapsed = sheetVhToPx(COLLAPSED_SHEET_VH + 1, viewportHeight);
    expect(resolveSheetSnap(nearCollapsed, viewportHeight)).toBe('collapsed');
  });

  it('snaps to expanded once dragged near the ceiling', () => {
    const nearExpanded = sheetVhToPx(EXPANDED_SHEET_VH - 1, viewportHeight);
    expect(resolveSheetSnap(nearExpanded, viewportHeight)).toBe('expanded');
  });

  it('snaps to whichever of the three points is nearest at a midway height', () => {
    const midwayCollapsedExpanded = sheetVhToPx((COLLAPSED_SHEET_VH + EXPANDED_SHEET_VH) / 2 + 2, viewportHeight);
    expect(resolveSheetSnap(midwayCollapsedExpanded, viewportHeight)).toBe('expanded');
    const midwayMinimizedCollapsed = sheetVhToPx((MINIMIZED_SHEET_VH + COLLAPSED_SHEET_VH) / 2 + 2, viewportHeight);
    expect(resolveSheetSnap(midwayMinimizedCollapsed, viewportHeight)).toBe('collapsed');
  });

  it('simulates a full pointer drag sequence landing in the expanded state', () => {
    // pointerdown at startHeight (collapsed), pointermove dragging up past
    // the midpoint, pointerup — the same math HomeClient.tsx runs per event.
    const collapsedPx = sheetVhToPx(COLLAPSED_SHEET_VH, viewportHeight);
    const startY = 600;
    const dragUpBy = 250; // moving the pointer up by 250px
    const endY = startY - dragUpBy;
    const candidateDuringDrag = clampSheetHeightPx(collapsedPx + (startY - endY), viewportHeight);
    expect(resolveSheetSnap(candidateDuringDrag, viewportHeight)).toBe('expanded');
  });

  // Velocity-aware release (worklist item #1's "make the sheet drag
  // velocity-aware" testbed): a fast flick wins even when the pointer never
  // crossed a snap point, and a fast flick the "wrong" way overrides a
  // position that would otherwise resolve the other way.
  describe('velocity-aware snap', () => {
    it('snaps expanded on a fast upward flick even near the minimized floor', () => {
      const nearMinimized = sheetVhToPx(MINIMIZED_SHEET_VH + 2, viewportHeight);
      expect(
        resolveSheetSnap(nearMinimized, viewportHeight, undefined, undefined, FLICK_VELOCITY_PX_PER_MS + 0.1),
      ).toBe('expanded');
    });

    it('snaps minimized on a fast downward flick even past the midpoint', () => {
      const midpointVh = (COLLAPSED_SHEET_VH + EXPANDED_SHEET_VH) / 2;
      const pastMidpoint = sheetVhToPx(midpointVh + 5, viewportHeight);
      expect(
        resolveSheetSnap(pastMidpoint, viewportHeight, undefined, undefined, -(FLICK_VELOCITY_PX_PER_MS + 0.1)),
      ).toBe('minimized');
    });

    it('falls back to position when velocity is below the flick threshold', () => {
      const nearMinimized = sheetVhToPx(MINIMIZED_SHEET_VH + 1, viewportHeight);
      // A slow drift, well under the threshold — should NOT override position.
      expect(
        resolveSheetSnap(nearMinimized, viewportHeight, undefined, undefined, FLICK_VELOCITY_PX_PER_MS - 0.3),
      ).toBe('minimized');
    });

    it('defaults to 0 velocity (pure position) when the param is omitted', () => {
      const nearExpanded = sheetVhToPx(EXPANDED_SHEET_VH - 1, viewportHeight);
      expect(resolveSheetSnap(nearExpanded, viewportHeight)).toBe('expanded');
    });
  });
});
