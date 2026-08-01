/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import HospitalResultCard from '@/components/HospitalResultCard';
import type { Hospital } from '@/types';

function makeHospital(overrides: Partial<Hospital> = {}): Hospital {
  return {
    id: 'h1',
    name: 'ESUT Teaching Hospital',
    service_type: 'hospital',
    address: 'Parklane, Enugu',
    city: 'Enugu',
    latitude: 6.45,
    longitude: 7.5,
    website: null,
    contact_phone: null,
    contact_email: null,
    logo_url: null,
    photos: [],
    hours: {},
    specialties: ['Cardiology', 'Emergency', 'Pediatrics', 'Radiology'],
    departments: [],
    rating_avg: 4.3,
    rating_count: 212,
    is_24_hour: false,
    show_doctors: true,
    is_private: false,
    verified: false,
    account_id: null,
    status: 'approved',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('HospitalResultCard', () => {
  it('renders a placeholder when the hospital has no photo', () => {
    const { container } = render(<HospitalResultCard hospital={makeHospital()} />);
    expect(container.querySelector('img')).not.toBeInTheDocument();
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('renders the hospital photo when available', () => {
    const hospital = makeHospital({ photos: [{ url: 'https://example.com/photo.jpg' }] });
    const { container } = render(<HospitalResultCard hospital={hospital} />);
    const img = container.querySelector('img');
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('src', 'https://example.com/photo.jpg');
  });

  it('omits the distance badge when distanceKm is not provided', () => {
    render(<HospitalResultCard hospital={makeHospital()} />);
    expect(screen.queryByText(/km$/)).not.toBeInTheDocument();
  });

  it('shows a distance badge formatted to one decimal when distanceKm is provided', () => {
    render(<HospitalResultCard hospital={makeHospital()} distanceKm={1.42} />);
    expect(screen.getByText('1.4 km')).toBeInTheDocument();
  });

  it('does not show a distance badge when distanceKm is null', () => {
    render(<HospitalResultCard hospital={makeHospital()} distanceKm={null} />);
    expect(screen.queryByText(/km$/)).not.toBeInTheDocument();
  });

  it('shows an Open 24h badge only when is_24_hour is true', () => {
    const { rerender } = render(
      <HospitalResultCard hospital={makeHospital({ is_24_hour: false })} />
    );
    expect(screen.queryByText('Open 24h')).not.toBeInTheDocument();

    rerender(<HospitalResultCard hospital={makeHospital({ is_24_hour: true })} />);
    expect(screen.getByText('Open 24h')).toBeInTheDocument();
  });

  it('shows a Verified badge only when the hospital is verified', () => {
    const { rerender } = render(
      <HospitalResultCard hospital={makeHospital({ verified: false })} />
    );
    expect(screen.queryByText('Verified')).not.toBeInTheDocument();

    rerender(<HospitalResultCard hospital={makeHospital({ verified: true })} />);
    expect(screen.getByText('Verified')).toBeInTheDocument();
  });

  it('renders up to 3 specialty pills, capping longer lists', () => {
    render(<HospitalResultCard hospital={makeHospital()} />);
    expect(screen.getByText('Cardiology')).toBeInTheDocument();
    expect(screen.getByText('Emergency')).toBeInTheDocument();
    expect(screen.getByText('Pediatrics')).toBeInTheDocument();
    expect(screen.queryByText('Radiology')).not.toBeInTheDocument();
  });

  it('renders the star rating when the hospital has ratings', () => {
    render(<HospitalResultCard hospital={makeHospital({ rating_avg: 4.3, rating_count: 212 })} />);
    expect(screen.getByLabelText('Rated 4.3 out of 5')).toBeInTheDocument();
    expect(screen.getByText('4.3 (212)')).toBeInTheDocument();
  });

  it('omits the rating row when the hospital has no ratings yet', () => {
    render(<HospitalResultCard hospital={makeHospital({ rating_count: 0 })} />);
    expect(screen.queryByLabelText(/Rated/)).not.toBeInTheDocument();
  });

  it('links the whole card to the hospital profile page', () => {
    render(<HospitalResultCard hospital={makeHospital({ id: 'abc-123' })} />);
    expect(screen.getByRole('link')).toHaveAttribute('href', '/hospitals/abc-123');
  });
});
