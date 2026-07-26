/**
 * @jest-environment jsdom
 */
import { prefersReducedMotion } from '@/lib/reducedMotion';

describe('prefersReducedMotion', () => {
  const originalMatchMedia = window.matchMedia;

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
  });

  it('returns false when the OS has not requested reduced motion', () => {
    window.matchMedia = jest.fn().mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia;
    expect(prefersReducedMotion()).toBe(false);
  });

  it('returns true when the OS has requested reduced motion', () => {
    window.matchMedia = jest.fn().mockReturnValue({ matches: true }) as unknown as typeof window.matchMedia;
    expect(prefersReducedMotion()).toBe(true);
  });

  it('queries the correct media feature', () => {
    const matchMedia = jest.fn().mockReturnValue({ matches: false });
    window.matchMedia = matchMedia as unknown as typeof window.matchMedia;
    prefersReducedMotion();
    expect(matchMedia).toHaveBeenCalledWith('(prefers-reduced-motion: reduce)');
  });
});
