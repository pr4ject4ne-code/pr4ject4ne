/**
 * @jest-environment jsdom
 *
 * Regression test for the worklist #8 bug: HomeClient read `symptom` from the
 * URL and showed a notice banner for it, but never added it to the actual
 * `/api/hospitals` fetch, so a symptom search silently fell through to the
 * unfiltered list. This asserts the fetch URL actually carries `symptom=`.
 */
import { render, screen, waitFor } from '@testing-library/react';
import HomeClient from '../HomeClient';

jest.mock('@/components/Layout', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

jest.mock('@/components/Map', () => ({
  __esModule: true,
  default: () => <div data-testid="map" />,
}));

jest.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams('symptom=Bleeding,CPR%20%26%20breathing'),
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
    expect(qs.get('symptom')).toBe('Bleeding,CPR & breathing');
  });

  it('shows the symptom-search guidance notice with the selected symptoms', async () => {
    render(<HomeClient />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.getByText(/Bleeding, CPR & breathing/)).toBeInTheDocument();
    expect(screen.getByText(/guidance only/i)).toBeInTheDocument();
  });
});
