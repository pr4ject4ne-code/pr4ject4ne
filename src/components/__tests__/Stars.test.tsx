/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import Stars from '@/components/Stars';

describe('Stars', () => {
  it('renders an accessible label and the average + count', () => {
    render(<Stars value={4.2} count={11} />);
    expect(screen.getByLabelText('Rated 4.2 out of 5')).toBeInTheDocument();
    expect(screen.getByText('4.2 (11)')).toBeInTheDocument();
  });

  it('omits the count when not provided', () => {
    render(<Stars value={3} />);
    expect(screen.getByText('3.0')).toBeInTheDocument();
  });
});
