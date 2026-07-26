// Shared JS-side prefers-reduced-motion check, for the handful of effects
// that are driven imperatively (pointer-tracked sheen, scroll-linked darken/
// parallax) rather than by a pure CSS transition/animation — those already
// get the blanket `@media (prefers-reduced-motion: reduce)` override in
// globals.css, but a JS effect that sets a CSS custom property or inline
// style every pointermove/scroll tick needs its own opt-out, since there's
// no CSS rule to intercept. Kept as a plain function (re-read each call, not
// cached at module load) so it stays correct if the OS setting changes while
// the page is open, and so it works safely under SSR (`window` is guarded).
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
