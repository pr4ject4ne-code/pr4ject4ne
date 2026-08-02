/**
 * @jest-environment jsdom
 *
 * Direct unit coverage for SearchBar.tsx (extracted from Header.tsx, commit
 * c66e208 — see Header.test.tsx for the symptom-search behavior that was
 * historically exercised only through Header; this file covers SearchBar
 * itself, including the `onHospitalSearch` hospital-scoped mode that
 * Header.test.tsx never exercised at all).
 */
import { render, screen, fireEvent } from '@testing-library/react';
import SearchBar from '../SearchBar';

const mockPush = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

function switchToSymptomMode() {
  fireEvent.click(screen.getByRole('button', { name: 'By symptom' }));
}

function switchToNameMode() {
  fireEvent.click(screen.getByRole('button', { name: 'By name' }));
}

function openPicker() {
  fireEvent.click(screen.getByText('Describe your symptoms…'));
}

describe('SearchBar mode pills', () => {
  beforeEach(() => {
    mockPush.mockClear();
  });

  it('defaults to Nearby selected (aria-pressed) with the other two unselected', () => {
    render(<SearchBar />);
    expect(screen.getByRole('button', { name: 'Nearby' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'By name' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(screen.getByRole('button', { name: 'By symptom' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('switching mode flips aria-pressed on the clicked pill and off the others', () => {
    render(<SearchBar />);
    switchToNameMode();
    expect(screen.getByRole('button', { name: 'By name' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Nearby' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('switching to symptom mode replaces the free-text input with a picker toggle', () => {
    render(<SearchBar />);
    switchToSymptomMode();
    expect(screen.getByText('Describe your symptoms…')).toBeInTheDocument();
    expect(screen.queryByLabelText('Search')).not.toBeInTheDocument();
  });
});

describe('SearchBar navigation per mode', () => {
  beforeEach(() => {
    mockPush.mockClear();
  });

  it('submits nearest mode as /?nearest=1', () => {
    render(<SearchBar />);
    fireEvent.submit(screen.getByRole('search'));
    expect(mockPush).toHaveBeenCalledWith('/?nearest=1');
  });

  it('submits by-name mode with the typed query as /?q=<value>', () => {
    render(<SearchBar />);
    switchToNameMode();
    fireEvent.change(screen.getByLabelText('Search'), { target: { value: 'Memfys' } });
    fireEvent.submit(screen.getByRole('search'));
    expect(mockPush).toHaveBeenCalledWith('/?q=Memfys');
  });

  it('submits by-name mode with no query as a bare /? (no q param)', () => {
    render(<SearchBar />);
    switchToNameMode();
    fireEvent.submit(screen.getByRole('search'));
    expect(mockPush).toHaveBeenCalledWith('/?');
  });
});

describe('SearchBar symptom multi-select', () => {
  beforeEach(() => {
    mockPush.mockClear();
  });

  it('Search stays disabled with nothing selected, enables once a symptom is chosen', () => {
    render(<SearchBar />);
    switchToSymptomMode();
    const searchBtn = screen.getByRole('button', { name: 'Search' });
    expect(searchBtn).toBeDisabled();

    openPicker();
    fireEvent.click(screen.getByRole('button', { name: 'Red or itchy eye' }));
    expect(searchBtn).not.toBeDisabled();
  });

  it('supports selecting multiple symptoms and joins them comma-separated on submit', () => {
    render(<SearchBar />);
    switchToSymptomMode();
    openPicker();
    fireEvent.click(screen.getByRole('button', { name: 'Red or itchy eye' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sore throat' }));
    fireEvent.submit(screen.getByRole('search'));
    expect(mockPush).toHaveBeenCalledWith('/?symptom=eye-red-itchy%2Cent-sore-throat');
  });

  it('does not navigate on submit with nothing selected and severity below the threshold', () => {
    render(<SearchBar />);
    switchToSymptomMode();
    fireEvent.submit(screen.getByRole('search'));
    expect(mockPush).not.toHaveBeenCalled();
  });
});

describe('SearchBar Stage 1 — red-flag emergency gate', () => {
  beforeEach(() => {
    mockPush.mockClear();
  });

  it('selecting a red-flag symptom short-circuits to the emergency outcome, ignoring any other selection', () => {
    render(<SearchBar />);
    switchToSymptomMode();
    openPicker();
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
    render(<SearchBar />);
    switchToSymptomMode();
    openPicker();
    const slider = screen.getByLabelText(/how severe does it feel/i);
    fireEvent.change(slider, { target: { value: '7' } });
    fireEvent.submit(screen.getByRole('search'));
    expect(mockPush).toHaveBeenCalledWith('/?emergency=1');
  });

  it('the Search button stays enabled once a red flag is selected even with no symptom chosen', () => {
    render(<SearchBar />);
    switchToSymptomMode();
    openPicker();
    const searchBtn = screen.getByRole('button', { name: 'Search' });
    expect(searchBtn).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: "Unresponsive or can't be roused" }));
    expect(searchBtn).not.toBeDisabled();
  });
});

/**
 * The founder-reported "I cannot see what I type" case: the input is styled
 * correctly, but on a phone the on-screen keyboard opens AFTER focus and can
 * leave it off-screen. See lib/keyboardSafeScroll.ts (unit-tested separately);
 * this covers the wiring — that focus starts the watcher and blur stops it.
 */
describe('SearchBar keyboard-safe focus', () => {
  class FakeVisualViewport extends EventTarget {
    offsetTop = 0;
    height = 800;
    shrink(to: number) {
      this.height = to;
      this.dispatchEvent(new Event('resize'));
    }
  }

  let viewport: FakeVisualViewport;
  let scrollBy: jest.Mock;

  function placeInputAt(top: number) {
    const input = screen.getByLabelText('Search');
    input.getBoundingClientRect = () =>
      ({ top, bottom: top + 40, height: 40, left: 0, right: 300, width: 300, x: 0, y: top }) as DOMRect;
    return input;
  }

  beforeEach(() => {
    viewport = new FakeVisualViewport();
    Object.defineProperty(window, 'visualViewport', {
      value: viewport,
      configurable: true,
      writable: true,
    });
    scrollBy = jest.fn();
    window.scrollBy = scrollBy as unknown as typeof window.scrollBy;
  });

  it('brings the input back into view when the keyboard shrinks the viewport while it is focused', () => {
    render(<SearchBar />);
    switchToNameMode();
    const input = placeInputAt(600);
    fireEvent.focus(input);
    // Nothing was obscured at focus time, so the page must not have moved.
    expect(scrollBy).not.toHaveBeenCalled();

    viewport.shrink(450); // keyboard opens over the bottom of the screen
    expect(scrollBy).toHaveBeenCalledTimes(1);
    expect(scrollBy.mock.calls[0][0].top).toBeGreaterThan(0);
  });

  it('stops watching the viewport after blur', () => {
    render(<SearchBar />);
    switchToNameMode();
    const input = placeInputAt(600);
    fireEvent.focus(input);
    fireEvent.blur(input);

    viewport.shrink(450);
    expect(scrollBy).not.toHaveBeenCalled();
  });
});

describe('SearchBar hospital-scoped mode (onHospitalSearch)', () => {
  it('hides the mode pill group entirely when onHospitalSearch is provided', () => {
    render(<SearchBar onHospitalSearch={jest.fn()} />);
    expect(screen.queryByRole('group', { name: 'Search mode' })).not.toBeInTheDocument();
  });

  it('calls onHospitalSearch with the typed query on submit instead of navigating', () => {
    const onHospitalSearch = jest.fn();
    render(<SearchBar onHospitalSearch={onHospitalSearch} />);
    fireEvent.change(screen.getByLabelText('Search'), { target: { value: 'cardiology' } });
    fireEvent.submit(screen.getByRole('search'));
    expect(onHospitalSearch).toHaveBeenCalledWith('cardiology');
    expect(mockPush).not.toHaveBeenCalled();
  });
});
