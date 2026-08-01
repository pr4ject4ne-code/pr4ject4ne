/**
 * @jest-environment jsdom
 *
 * Regression test for the worklist #8 bug: HomeClient read `symptom` from the
 * URL and showed a notice banner for it, but never added it to the actual
 * `/api/hospitals` fetch, so a symptom search silently fell through to the
 * unfiltered list. This asserts the fetch URL actually carries `symptom=`.
 *
 * Also covers the worklist #8/#11 two-stage redesign: an `emergency=1` URL
 * param (set by Header.tsx's Stage-1 red-flag gate) must short-circuit to
 * the emergency banner and skip specialty-matching entirely — no `symptom`
 * param should ever reach the API fetch in that case.
 */
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import HomeClient from '../HomeClient';

jest.mock('@/components/Layout', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

jest.mock('@/components/Map', () => ({
  __esModule: true,
  default: () => <div data-testid="map" />,
}));

let mockSearchParams = new URLSearchParams('symptom=eye-red-itchy,ent-sore-throat');
const mockPush = jest.fn();

jest.mock('next/navigation', () => ({
  useSearchParams: () => mockSearchParams,
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('@/lib/geolocation', () => ({
  getCurrentPosition: () => Promise.reject(new Error('denied')),
  DEFAULT_CENTER: { lat: 6.44, lng: 7.5 },
}));

jest.mock('@/lib/map', () => ({
  fetchRoute: jest.fn(() => Promise.resolve(null)),
  distanceKm: jest.fn(() => 0),
  geocode: jest.fn(),
}));

describe('HomeClient symptom search', () => {
  beforeEach(() => {
    mockSearchParams = new URLSearchParams('symptom=eye-red-itchy,ent-sore-throat');
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ hospitals: [], total: 0 }),
      } as Response),
    );
  });

  it('includes the symptom param (fixed — worklist #8) in the /api/hospitals request', async () => {
    render(<HomeClient />);

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());

    const calledUrl = (global.fetch as jest.Mock).mock.calls[0][0] as string;
    expect(calledUrl).toContain('/api/hospitals?');
    const qs = new URLSearchParams(calledUrl.split('?')[1]);
    expect(qs.get('symptom')).toBe('eye-red-itchy,ent-sore-throat');
  });

  it('shows the non-diagnostic "usually see" guidance notice for the selected symptoms', async () => {
    render(<HomeClient />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.getByText(/Ophthalmology \/ eye clinic/)).toBeInTheDocument();
    expect(screen.getByText(/Otolaryngology \(ENT\)/)).toBeInTheDocument();
    expect(screen.getByText(/not an assessment of your condition/i)).toBeInTheDocument();
  });
});

describe('HomeClient emergency outcome (Stage 1 short-circuit)', () => {
  beforeEach(() => {
    mockSearchParams = new URLSearchParams('emergency=1');
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ hospitals: [], total: 0 }),
      } as Response),
    );
  });

  it('shows the emergency banner with a persistent call-112 affordance', async () => {
    render(<HomeClient />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.getByRole('alert')).toHaveTextContent(/this may be an emergency/i);
    const callLink = screen.getByRole('link', { name: /call 112/i });
    expect(callLink).toHaveAttribute('href', 'tel:112');
  });

  it('never sends a symptom param to the API when emergency=1, even if one were present', async () => {
    mockSearchParams = new URLSearchParams('emergency=1&symptom=eye-red-itchy');
    render(<HomeClient />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    const calledUrl = (global.fetch as jest.Mock).mock.calls[0][0] as string;
    const qs = new URLSearchParams(calledUrl.split('?')[1]);
    expect(qs.get('symptom')).toBeNull();
  });

  it('does not show the non-emergency symptom guidance notice', async () => {
    render(<HomeClient />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.queryByText(/usually see/i)).not.toBeInTheDocument();
  });
});

describe('HomeClient map section (Phase 2 rebuild: expandable, not a fixed/sheet stage)', () => {
  beforeEach(() => {
    mockSearchParams = new URLSearchParams('');
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ hospitals: [], total: 0 }),
      } as Response),
    );
  });

  it('renders the map section collapsed by default (aria-expanded=false, "Expand map" label)', async () => {
    render(<HomeClient />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    const toggle = screen.getByRole('button', { name: /expand map/i });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });

  it('clicking the toggle flips aria-expanded to true and swaps the label to "Collapse map"', async () => {
    render(<HomeClient />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    const toggle = screen.getByRole('button', { name: /expand map/i });
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(toggle).toHaveTextContent(/collapse map/i);
  });

  it('renders exactly one search UI instance (SearchBar, no duplicate from Header)', async () => {
    render(<HomeClient />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.getAllByRole('search')).toHaveLength(1);
  });
});
