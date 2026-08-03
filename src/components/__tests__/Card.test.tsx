/**
 * @jest-environment jsdom
 */
import { render } from '@testing-library/react';
import Card from '@/components/Card';

/** CSS-module class names are identity-mapped by next/jest, so `styles.x` === 'x'. */
function classesOf(container: HTMLElement): string[] {
  return (container.firstElementChild?.className ?? '').split(/\s+/).filter(Boolean);
}

describe('Card', () => {
  it('renders a glass div by default', () => {
    const { container } = render(<Card>content</Card>);
    expect(container.firstElementChild?.tagName).toBe('DIV');
    expect(classesOf(container)).toEqual(['card', 'glass']);
  });

  it('renders the requested element and variant', () => {
    const { container } = render(
      <Card as="article" variant="plain">
        content
      </Card>,
    );
    expect(container.firstElementChild?.tagName).toBe('ARTICLE');
    expect(classesOf(container)).toEqual(['card', 'plain']);
  });

  it('adds the shared interaction class only when interactive', () => {
    const { container, rerender } = render(<Card variant="plain">content</Card>);
    expect(classesOf(container)).not.toContain('interactive');

    rerender(
      <Card variant="plain" interactive>
        content
      </Card>,
    );
    expect(classesOf(container)).toContain('interactive');
  });

  it('keeps caller class names and passes through DOM props', () => {
    const { container } = render(
      <Card variant="plain" interactive className="mine" role="status">
        content
      </Card>,
    );
    expect(classesOf(container)).toEqual(['card', 'plain', 'interactive', 'mine']);
    expect(container.firstElementChild).toHaveAttribute('role', 'status');
  });
});
