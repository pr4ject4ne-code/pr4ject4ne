/**
 * @jest-environment jsdom
 *
 * Covers the homepage symptom search's two-stage design (worklist #8/#11):
 * Stage 1 is the red-flag emergency gate (any red-flag symptom, or a
 * severity >=7 slider value, short-circuits straight to the emergency
 * outcome — no specialty routing); Stage 2 is the closed, region-based,
 * non-emergency symptom picker.
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

function openPicker() {
  fireEvent.click(screen.getByText('Describe your symptoms…'));
}

describe('Header symptom search (worklist #8/#11)', () => {
  beforeEach(() => {
    mockPush.mockClear();
  });

  it('shows a symptom picker toggle instead of a free-text input in symptom mode', () => {
    render(<Header showSearch />);
    switchToSymptomMode();
    expect(screen.getByText('Describe your symptoms…')).toBeInTheDocument();
    expect(screen.queryByLabelText('Search')).not.toBeInTheDocument();
  });

  it('disables Search with nothing selected, enables it once a symptom is chosen', () => {
    render(<Header showSearch />);
    switchToSymptomMode();
    const searchBtn = screen.getByRole('button', { name: 'Search' });
    expect(searchBtn).toBeDisabled();

    openPicker();
    fireEvent.click(screen.getByRole('button', { name: 'Red or itchy eye' }));
    expect(searchBtn).not.toBeDisabled();
  });

  it('navigates with the selected symptom id(s) when no red flag/high severity is set', () => {
    render(<Header showSearch />);
    switchToSymptomMode();
    openPicker();
    fireEvent.click(screen.getByRole('button', { name: 'Red or itchy eye' }));
    fireEvent.submit(screen.getByRole('search'));
    expect(mockPush).toHaveBeenCalledWith('/?symptom=eye-red-itchy');
  });

  it('does not navigate on submit with nothing selected and severity below the threshold', () => {
    render(<Header showSearch />);
    switchToSymptomMode();
    fireEvent.submit(screen.getByRole('search'));
    expect(mockPush).not.toHaveBeenCalled();
  });

  describe('Stage 1 — red-flag emergency gate', () => {
    it('selecting a red-flag symptom short-circuits to the emergency outcome, ignoring any other selection', () => {
      render(<Header showSearch />);
      switchToSymptomMode();
      openPicker();
      // Pick a normal, non-emergency symptom too — should be ignored once a
      // red flag is also selected.
      fireEvent.click(screen.getByRole('button', { name: 'Red or itchy eye' }));
      fireEvent.click(
        screen.getByRole('button', {
          name: 'Chest pain or pressure, especially with sweating, nausea, or breathlessness',
        }),
      );
      fireEvent.submit(screen.getByRole('search'));
      expect(mockPush).toHaveBeenCalledWith('/?emergency=1');
    });

    it('a severity of 7+ on the slider alone (no red-flag symptom) triggers the emergency outcome', () => {
      render(<Header showSearch />);
      switchToSymptomMode();
      openPicker();
      const slider = screen.getByLabelText(/how severe does it feel/i);
      fireEvent.change(slider, { target: { value: '7' } });
      fireEvent.submit(screen.getByRole('search'));
      expect(mockPush).toHaveBeenCalledWith('/?emergency=1');
    });

    it('a severity below 7 and no red flags proceeds to normal symptom routing', () => {
      render(<Header showSearch />);
      switchToSymptomMode();
      openPicker();
      const slider = screen.getByLabelText(/how severe does it feel/i);
      fireEvent.change(slider, { target: { value: '6' } });
      fireEvent.click(screen.getByRole('button', { name: 'Red or itchy eye' }));
      fireEvent.submit(screen.getByRole('search'));
      expect(mockPush).toHaveBeenCalledWith('/?symptom=eye-red-itchy');
    });

    it('the Search button stays enabled once a red flag is selected even with no symptom chosen', () => {
      render(<Header showSearch />);
      switchToSymptomMode();
      openPicker();
      const searchBtn = screen.getByRole('button', { name: 'Search' });
      expect(searchBtn).toBeDisabled();
      fireEvent.click(screen.getByRole('button', { name: "Unresponsive or can't be roused" }));
      expect(searchBtn).not.toBeDisabled();
    });
  });
});
