/**
 * @jest-environment jsdom
 *
 * Covers the min-2-symptom search gate (worklist #34): symptom mode is a
 * whitelist multi-select, not free text, and the Search button/submit are
 * blocked until at least 2 symptoms are selected.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import Header from '../Header';

const mockPush = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('@/lib/useSession', () => ({
  useSession: () => ({ user: null, loading: false }),
}));

function switchToSymptomMode() {
  const select = screen.getByLabelText('Search mode');
  fireEvent.change(select, { target: { value: 'symptom' } });
}

describe('Header symptom search (worklist #34)', () => {
  beforeEach(() => {
    mockPush.mockClear();
  });

  it('shows a symptom picker toggle instead of a free-text input in symptom mode', () => {
    render(<Header showSearch />);
    switchToSymptomMode();
    expect(screen.getByText('Select symptoms…')).toBeInTheDocument();
    expect(screen.queryByLabelText('Search')).not.toBeInTheDocument();
  });

  it('disables the Search button until 2 symptoms are selected', () => {
    render(<Header showSearch />);
    switchToSymptomMode();
    const searchBtn = screen.getByRole('button', { name: 'Search' });
    expect(searchBtn).toBeDisabled();

    fireEvent.click(screen.getByText('Select symptoms…'));
    fireEvent.click(screen.getByRole('button', { name: 'Bleeding' }));
    expect(searchBtn).toBeDisabled(); // only 1 selected

    fireEvent.click(screen.getByRole('button', { name: 'Burns' }));
    expect(searchBtn).not.toBeDisabled(); // 2 selected
  });

  it('does not navigate on submit with fewer than 2 symptoms selected', () => {
    render(<Header showSearch />);
    switchToSymptomMode();
    fireEvent.click(screen.getByText('Select symptoms…'));
    fireEvent.click(screen.getByRole('button', { name: 'Bleeding' }));
    fireEvent.submit(screen.getByRole('search'));
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('navigates with a comma-joined symptom list once 2+ are selected', () => {
    render(<Header showSearch />);
    switchToSymptomMode();
    fireEvent.click(screen.getByText('Select symptoms…'));
    fireEvent.click(screen.getByRole('button', { name: 'Bleeding' }));
    fireEvent.click(screen.getByRole('button', { name: 'Burns' }));
    fireEvent.submit(screen.getByRole('search'));
    expect(mockPush).toHaveBeenCalledWith('/?symptom=Bleeding%2CBurns');
  });
});
