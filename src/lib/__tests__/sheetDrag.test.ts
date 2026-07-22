import {
  clampSheetHeightPx,
  resolveSheetSnap,
  sheetVhToPx,
  COLLAPSED_SHEET_VH,
  EXPANDED_SHEET_VH,
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
});
