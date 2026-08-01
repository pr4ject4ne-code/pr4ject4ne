/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import ErrorBubble from '@/components/ErrorBubble';

describe('ErrorBubble', () => {
  let scrollIntoViewMock: jest.Mock;

  beforeEach(() => {
    scrollIntoViewMock = jest.fn();
    Element.prototype.scrollIntoView = scrollIntoViewMock;
  });

  it('renders nothing when message is null', () => {
    const { container } = render(<ErrorBubble message={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when message is undefined', () => {
    const { container } = render(<ErrorBubble message={undefined} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when message is an empty string', () => {
    const { container } = render(<ErrorBubble message="" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders role="alert" with the message text when a message is given', () => {
    render(<ErrorBubble message="Something went wrong" />);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Something went wrong');
  });

  it('banner variant scrolls into view when the message appears, and again when it changes', () => {
    const { rerender } = render(<ErrorBubble message="First error" variant="banner" />);
    expect(scrollIntoViewMock).toHaveBeenCalledTimes(1);

    rerender(<ErrorBubble message="Second, different error" variant="banner" />);
    expect(scrollIntoViewMock).toHaveBeenCalledTimes(2);
  });

  it('field variant never calls scrollIntoView', () => {
    const { rerender } = render(<ErrorBubble message="Field error" variant="field" />);
    rerender(<ErrorBubble message="Different field error" variant="field" />);
    expect(scrollIntoViewMock).not.toHaveBeenCalled();
  });
});
