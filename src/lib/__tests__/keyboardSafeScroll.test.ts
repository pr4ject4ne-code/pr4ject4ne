/**
 * @jest-environment jsdom
 *
 * Exercises the dynamic scenario a static CSS check cannot: a mobile keyboard
 * opening AFTER focus, which shrinks window.visualViewport and can leave the
 * focused input off-screen or under the sticky header.
 */
import { keepFocusedElementVisible } from '@/lib/keyboardSafeScroll';
import { prefersReducedMotion } from '@/lib/reducedMotion';

jest.mock('@/lib/reducedMotion', () => ({
  prefersReducedMotion: jest.fn(),
}));

const mockPrefersReducedMotion = prefersReducedMotion as jest.Mock;

/** Minimal stand-in for window.visualViewport: jsdom has no visual viewport at
 * all, so the keyboard case is unreachable without one. */
class FakeVisualViewport extends EventTarget {
  offsetTop = 0;
  height = 800;

  /** Mimics an on-screen keyboard taking the bottom of the screen. */
  openKeyboard(keyboardHeight: number) {
    this.height = 800 - keyboardHeight;
    this.dispatchEvent(new Event('resize'));
  }
}

let viewport: FakeVisualViewport;
let scrollBy: jest.Mock;

function elementAt(top: number, height = 40): HTMLElement {
  const el = document.createElement('input');
  document.body.appendChild(el);
  el.getBoundingClientRect = () =>
    ({ top, bottom: top + height, height, left: 0, right: 0, width: 300, x: 0, y: top }) as DOMRect;
  return el;
}

beforeEach(() => {
  mockPrefersReducedMotion.mockReturnValue(false);
  document.body.innerHTML = '';
  viewport = new FakeVisualViewport();
  Object.defineProperty(window, 'visualViewport', {
    value: viewport,
    configurable: true,
    writable: true,
  });
  scrollBy = jest.fn();
  window.scrollBy = scrollBy as unknown as typeof window.scrollBy;
});

describe('keepFocusedElementVisible on focus', () => {
  it('leaves the page alone when the control is already comfortably visible', () => {
    keepFocusedElementVisible(elementAt(300));
    expect(scrollBy).not.toHaveBeenCalled();
  });

  it('scrolls a control that sits under the sticky header down into the clear', () => {
    // top: 20 is inside the viewport but underneath the 88px sticky header.
    keepFocusedElementVisible(elementAt(20));
    expect(scrollBy).toHaveBeenCalledTimes(1);
    const { top, behavior } = scrollBy.mock.calls[0][0];
    expect(top).toBeLessThan(0); // scroll up so the element moves down the screen
    expect(behavior).toBe('smooth');
  });

  it('scrolls instantly under reduced motion', () => {
    mockPrefersReducedMotion.mockReturnValue(true);
    keepFocusedElementVisible(elementAt(20));
    expect(scrollBy.mock.calls[0][0].behavior).toBe('auto');
  });

  it('never scrolls for a control inside a sticky/fixed ancestor (it rides with the viewport)', () => {
    const header = document.createElement('header');
    header.style.position = 'sticky';
    document.body.appendChild(header);
    const el = elementAt(10);
    header.appendChild(el);
    keepFocusedElementVisible(el);
    expect(scrollBy).not.toHaveBeenCalled();
  });

  it('no-ops on a null element', () => {
    expect(() => keepFocusedElementVisible(null)()).not.toThrow();
    expect(scrollBy).not.toHaveBeenCalled();
  });
});

describe('keepFocusedElementVisible when the keyboard opens', () => {
  it('re-centers an input the keyboard has covered', () => {
    // Visible at focus time (viewport 0-800), so no scroll yet.
    const el = elementAt(600);
    const release = keepFocusedElementVisible(el);
    expect(scrollBy).not.toHaveBeenCalled();

    // Keyboard takes the bottom 350px: the visible band is now 0-450 and the
    // input at 600-640 is behind the keyboard.
    viewport.openKeyboard(350);

    expect(scrollBy).toHaveBeenCalledTimes(1);
    const { top, behavior } = scrollBy.mock.calls[0][0];
    // Target center of the safe band (88 .. 442) is 265; element center is 620.
    expect(top).toBeCloseTo(620 - 265, 0);
    expect(behavior).toBe('auto');
    release();
  });

  it('leaves the page alone if the input is still visible once the keyboard is open', () => {
    const el = elementAt(200);
    const release = keepFocusedElementVisible(el);
    viewport.openKeyboard(350);
    expect(scrollBy).not.toHaveBeenCalled();
    release();
  });

  it('stops watching once released (blur/unmount)', () => {
    const release = keepFocusedElementVisible(elementAt(600));
    release();
    viewport.openKeyboard(350);
    expect(scrollBy).not.toHaveBeenCalled();
  });

  it('still works with no visualViewport support, using the layout viewport', () => {
    Object.defineProperty(window, 'visualViewport', {
      value: undefined,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true });
    keepFocusedElementVisible(elementAt(20));
    expect(scrollBy).toHaveBeenCalledTimes(1);
  });
});
