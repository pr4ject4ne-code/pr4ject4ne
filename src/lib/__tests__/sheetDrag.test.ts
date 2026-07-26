import {
  clampSheetHeightPx,
  resolveSheetSnap,
  sheetVhToPx,
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
// pointer sequence land in the right expanded/collapsed state".
describe('sheetDrag', () => {
  const viewportHeight = 800;

  it('converts vh to px against the given viewport height', () => {
    expect(sheetVhToPx(50, 800)).toBe(400);
    expect(sheetVhToPx(COLLAPSED_SHEET_VH, 1000)).toBeCloseTo(460);
  });

  it('clamps a candidate height to the collapsed floor', () => {
    const collapsedPx = sheetVhToPx(COLLAPSED_SHEET_VH, viewportHeight);
    expect(clampSheetHeightPx(0, viewportHeight)).toBe(collapsedPx);
    expect(clampSheetHeightPx(-500, viewportHeight)).toBe(collapsedPx);
  });

  it('clamps a candidate height to the expanded ceiling', () => {
    const expandedPx = sheetVhToPx(EXPANDED_SHEET_VH, viewportHeight);
    expect(clampSheetHeightPx(viewportHeight * 2, viewportHeight)).toBe(expandedPx);
  });

  it('leaves an in-range candidate untouched', () => {
    const midway = sheetVhToPx(60, viewportHeight);
    expect(clampSheetHeightPx(midway, viewportHeight)).toBe(midway);
  });

  it('snaps to collapsed when dragged only slightly past the floor', () => {
    const nearCollapsed = sheetVhToPx(COLLAPSED_SHEET_VH + 2, viewportHeight);
    expect(resolveSheetSnap(nearCollapsed, viewportHeight)).toBe(false);
  });

  it('snaps to expanded once dragged past the midpoint', () => {
    const midpointVh = (COLLAPSED_SHEET_VH + EXPANDED_SHEET_VH) / 2;
    const justPastMidpoint = sheetVhToPx(midpointVh + 1, viewportHeight);
    expect(resolveSheetSnap(justPastMidpoint, viewportHeight)).toBe(true);
  });

  it('simulates a full pointer drag sequence landing in the expanded state', () => {
    // pointerdown at startHeight (collapsed), pointermove dragging up past
    // the midpoint, pointerup — the same math HomeClient.tsx runs per event.
    const collapsedPx = sheetVhToPx(COLLAPSED_SHEET_VH, viewportHeight);
    const startY = 600;
    const dragUpBy = 250; // moving the pointer up by 250px
    const endY = startY - dragUpBy;
    const candidateDuringDrag = clampSheetHeightPx(collapsedPx + (startY - endY), viewportHeight);
    expect(resolveSheetSnap(candidateDuringDrag, viewportHeight)).toBe(true);
  });

  // Velocity-aware release (worklist item #1's "make the sheet drag
  // velocity-aware" testbed): a fast flick wins even when the pointer never
  // crossed the midpoint, and a fast flick the "wrong" way overrides a
  // position that would otherwise resolve the other way.
  describe('velocity-aware snap', () => {
    it('snaps expanded on a fast upward flick even near the collapsed floor', () => {
      const nearCollapsed = sheetVhToPx(COLLAPSED_SHEET_VH + 2, viewportHeight);
      expect(
        resolveSheetSnap(nearCollapsed, viewportHeight, undefined, undefined, FLICK_VELOCITY_PX_PER_MS + 0.1),
      ).toBe(true);
    });

    it('snaps collapsed on a fast downward flick even past the midpoint', () => {
      const midpointVh = (COLLAPSED_SHEET_VH + EXPANDED_SHEET_VH) / 2;
      const pastMidpoint = sheetVhToPx(midpointVh + 5, viewportHeight);
      expect(
        resolveSheetSnap(pastMidpoint, viewportHeight, undefined, undefined, -(FLICK_VELOCITY_PX_PER_MS + 0.1)),
      ).toBe(false);
    });

    it('falls back to position when velocity is below the flick threshold', () => {
      const nearCollapsed = sheetVhToPx(COLLAPSED_SHEET_VH + 2, viewportHeight);
      // A slow drift, well under the threshold — should NOT override position.
      expect(
        resolveSheetSnap(nearCollapsed, viewportHeight, undefined, undefined, FLICK_VELOCITY_PX_PER_MS - 0.3),
      ).toBe(false);
    });

    it('defaults to 0 velocity (pure position) when the param is omitted', () => {
      const midpointVh = (COLLAPSED_SHEET_VH + EXPANDED_SHEET_VH) / 2;
      const justPastMidpoint = sheetVhToPx(midpointVh + 1, viewportHeight);
      expect(resolveSheetSnap(justPastMidpoint, viewportHeight)).toBe(true);
    });
  });
});
