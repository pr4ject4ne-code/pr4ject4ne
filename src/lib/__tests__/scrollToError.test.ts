/**
 * @jest-environment jsdom
 */
import { scrollToElement, scrollToFirstInvalidField } from '@/lib/scrollToError';
import { prefersReducedMotion } from '@/lib/reducedMotion';

jest.mock('@/lib/reducedMotion', () => ({
  prefersReducedMotion: jest.fn(),
}));

const mockPrefersReducedMotion = prefersReducedMotion as jest.Mock;

beforeEach(() => {
  mockPrefersReducedMotion.mockReturnValue(false);
});

describe('scrollToElement', () => {
  let scrollIntoViewMock: jest.Mock;

  beforeEach(() => {
    scrollIntoViewMock = jest.fn();
    Element.prototype.scrollIntoView = scrollIntoViewMock;
  });

  it('no-ops when the element is null', () => {
    scrollToElement(null);
    expect(scrollIntoViewMock).not.toHaveBeenCalled();
  });

  it('scrolls smoothly, centered, when motion is not reduced', () => {
    mockPrefersReducedMotion.mockReturnValue(false);
    const el = document.createElement('div');
    scrollToElement(el);
    expect(scrollIntoViewMock).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center' });
  });

  it('scrolls instantly, still centered, under reduced motion', () => {
    mockPrefersReducedMotion.mockReturnValue(true);
    const el = document.createElement('div');
    scrollToElement(el);
    expect(scrollIntoViewMock).toHaveBeenCalledWith({ behavior: 'auto', block: 'center' });
  });
});

describe('scrollToFirstInvalidField', () => {
  let scrollIntoViewMock: jest.Mock;

  beforeEach(() => {
    scrollIntoViewMock = jest.fn();
    Element.prototype.scrollIntoView = scrollIntoViewMock;
  });

  it('finds and scrolls to the first [aria-invalid="true"] field inside the container', () => {
    const container = document.createElement('form');
    container.innerHTML = `
      <input aria-invalid="false" />
      <input id="bad-field" aria-invalid="true" />
    `;
    scrollToFirstInvalidField(container);
    expect(scrollIntoViewMock).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center' });
  });

  it('no-ops when the container is null', () => {
    scrollToFirstInvalidField(null);
    expect(scrollIntoViewMock).not.toHaveBeenCalled();
  });

  it('no-ops when the container has no invalid field', () => {
    const container = document.createElement('form');
    container.innerHTML = `<input aria-invalid="false" />`;
    scrollToFirstInvalidField(container);
    expect(scrollIntoViewMock).not.toHaveBeenCalled();
  });
});
