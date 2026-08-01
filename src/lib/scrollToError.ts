// Shared scroll-to-error helpers. Centralizes "bring the error into view"
// behavior so every form does it the same way instead of ad hoc scrollIntoView
// calls scattered per-page. Reuses the project's established reduced-motion
// check (see reducedMotion.ts) rather than reinventing a motion preference.
import { prefersReducedMotion } from './reducedMotion';

/** Smooth-scrolls (or instantly scrolls, under reduced motion) an element to
 * the vertical center of the viewport. No-ops if the element doesn't exist. */
export function scrollToElement(el: Element | null): void {
  if (!el) return;
  el.scrollIntoView({
    behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    block: 'center',
  });
}

/** Scrolls to the first invalid field inside a form container. Reuses the
 * `aria-invalid="true"` attribute that Input.tsx/Dropdown.tsx already set on
 * every field with an error — no per-field ref-plumbing needed. */
export function scrollToFirstInvalidField(container: HTMLElement | null): void {
  scrollToElement(container?.querySelector('[aria-invalid="true"]') ?? null);
}
