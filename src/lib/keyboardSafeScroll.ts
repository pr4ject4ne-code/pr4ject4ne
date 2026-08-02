// Keeps a focused form control inside the part of the viewport the user can
// actually SEE on a phone.
//
// The problem this exists for: when a mobile on-screen keyboard opens, the
// visual viewport shrinks (iOS Safari) or the layout viewport is resized
// (Android Chrome). An input that was perfectly visible when it was tapped can
// end up behind the keyboard, or scrolled under the sticky header
// (Header.module.css `.bar` is `position: sticky; top: 0`, and on plain pages
// it is a translucent BLURRED surface, so anything under it is smeared rather
// than hidden — which reads to a user as "I cannot see what I am typing" even
// though the input itself is styled correctly). Browsers do their own
// scroll-on-focus, but it is inconsistent across iOS/Android versions and is
// unaware of our sticky header.
//
// Design notes:
//  - Corrects position ONLY when the control is genuinely outside the visible
//    band. A blanket `scrollIntoView({block:'center'})` on every focus would
//    yank a perfectly visible desktop page around on a plain mouse click.
//  - Uses window.scrollBy against `visualViewport.offsetTop/height` rather than
//    Element.scrollIntoView, because scrollIntoView centers within the LAYOUT
//    viewport, which does not shrink when an iOS keyboard opens — that is the
//    exact case this is here to handle.
//  - Listens to visualViewport `resize` (keyboard open/close, rotation) but
//    deliberately NOT `scroll`: re-centering on scroll would fight a user who
//    is intentionally scrolling away while a field is still focused.
//  - Reduced motion honored via the project's shared reducedMotion.ts check.
import { prefersReducedMotion } from './reducedMotion';

const noop = () => {};

/** Vertical room reserved for the sticky header, so a "corrected" control is
 * never parked underneath it. Matches ErrorBubble.module.css's own
 * `scroll-margin-top: 88px` allowance for the same header. */
const STICKY_HEADER_ALLOWANCE = 88;

/** Small slack at the bottom edge so a control that is merely flush against
 * the keyboard still counts as needing a correction. */
const EDGE_MARGIN = 8;

/** The slice of the layout viewport that is actually on screen. Falls back to
 * the layout viewport where visualViewport is unsupported (older browsers,
 * jsdom), which degrades to plain "is it in the viewport" behavior. */
function visibleBand(): { top: number; bottom: number } {
  const vv = window.visualViewport;
  const top = vv ? vv.offsetTop : 0;
  const height = vv ? vv.height : window.innerHeight;
  return { top, bottom: top + height };
}

/** True when the element rides with the viewport (inside a sticky/fixed
 * ancestor, e.g. the site header's own search bar). Scrolling the document
 * cannot move such an element relative to the viewport, so trying to would
 * just scroll the page out from under the user for no benefit. */
function isViewportPinned(el: HTMLElement): boolean {
  for (let node: HTMLElement | null = el; node; node = node.parentElement) {
    const position = window.getComputedStyle(node).position;
    if (position === 'fixed' || position === 'sticky') return true;
  }
  return false;
}

function ensureVisible(el: HTMLElement, behavior: ScrollBehavior): void {
  if (typeof window.scrollBy !== 'function') return;
  const band = visibleBand();
  const safeTop = band.top + STICKY_HEADER_ALLOWANCE;
  const safeBottom = band.bottom - EDGE_MARGIN;
  if (safeBottom <= safeTop) return;
  const rect = el.getBoundingClientRect();
  // Already comfortably visible: leave the page exactly where it is.
  if (rect.top >= safeTop && rect.bottom <= safeBottom) return;
  const delta = rect.top + rect.height / 2 - (safeTop + safeBottom) / 2;
  if (Math.abs(delta) < 1) return;
  window.scrollBy({ top: delta, behavior });
}

/**
 * Call on focus with the focused control. Brings it into the visible band if
 * needed, then keeps it there for as long as the returned release function has
 * not been called (call it on blur / unmount).
 */
export function keepFocusedElementVisible(el: HTMLElement | null): () => void {
  if (!el || typeof window === 'undefined') return noop;
  if (isViewportPinned(el)) return noop;
  ensureVisible(el, prefersReducedMotion() ? 'auto' : 'smooth');
  const vv = window.visualViewport;
  if (!vv) return noop;
  // The keyboard has opened/closed (or the device rotated): the visible band
  // just changed, so re-check. Instant, not smooth — the viewport is already
  // animating and a competing smooth scroll reads as lag.
  const onViewportResize = () => ensureVisible(el, 'auto');
  vv.addEventListener('resize', onViewportResize);
  return () => vv.removeEventListener('resize', onViewportResize);
}
