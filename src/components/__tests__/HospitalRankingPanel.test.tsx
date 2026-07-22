/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import HospitalRankingPanel from '@/components/HospitalRankingPanel';
import type { HospitalRanking } from '@/lib/hospital-ranking';

describe('HospitalRankingPanel', () => {
  it('renders nothing while ranking data has not loaded (or is unavailable)', () => {
    const { container } = render(<HospitalRankingPanel city="Enugu" ranking={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows stars, region rank, and national rank for a rated hospital', () => {
    const ranking: HospitalRanking = {
      rating_avg: 4.5,
      rating_count: 12,
      region: { rank: 2, total: 6 },
      national: { rank: 5, total: 20 },
    };
    render(<HospitalRankingPanel city="Enugu" ranking={ranking} />);
    expect(screen.getByLabelText('Rated 4.5 out of 5')).toBeInTheDocument();
    expect(screen.getByText('4.5 (12)')).toBeInTheDocument();
    expect(screen.getByText('In Enugu')).toBeInTheDocument();
    expect(screen.getByText('#2 of 6')).toBeInTheDocument();
    expect(screen.getByText('Nationally')).toBeInTheDocument();
    expect(screen.getByText('#5 of 20')).toBeInTheDocument();
  });

  it('falls back to "In your area" when the hospital has no city on file', () => {
    const ranking: HospitalRanking = {
      rating_avg: 3.2,
      rating_count: 4,
      region: { rank: 1, total: 3 },
      national: { rank: 8, total: 40 },
    };
    render(<HospitalRankingPanel city={null} ranking={ranking} />);
    expect(screen.getByText('In your area')).toBeInTheDocument();
  });

  it('shows "Not yet rated" instead of a nonsensical rank for a zero-review hospital', () => {
    const ranking: HospitalRanking = {
      rating_avg: 0,
      rating_count: 0,
      region: { rank: 1, total: 1 },
      national: { rank: 1, total: 1 },
    };
    render(<HospitalRankingPanel city="Enugu" ranking={ranking} />);
    expect(screen.getByText('Not yet rated')).toBeInTheDocument();
    expect(screen.queryByText(/#1 of 1/)).not.toBeInTheDocument();
  });

  it('omits the region row when the hospital is not eligible for ranking (e.g. not approved)', () => {
    const ranking: HospitalRanking = {
      rating_avg: 4.0,
      rating_count: 3,
      region: null,
      national: null,
    };
    render(<HospitalRankingPanel city="Enugu" ranking={ranking} />);
    expect(screen.getByText('4.0 (3)')).toBeInTheDocument();
    expect(screen.queryByText('In Enugu')).not.toBeInTheDocument();
    expect(screen.queryByText('Nationally')).not.toBeInTheDocument();
  });
});
