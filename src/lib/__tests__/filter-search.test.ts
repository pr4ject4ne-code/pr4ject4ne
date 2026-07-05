import { buildHospitalsQuery } from '@/lib/filter-search';

describe('buildHospitalsQuery', () => {
  it('includes only set filters and always sets pagination', () => {
    const qs = buildHospitalsQuery({
      serviceType: 'pharmacy',
      location: 'Enugu',
      limit: 20,
      offset: 0,
    });
    const params = new URLSearchParams(qs);
    expect(params.get('service_type')).toBe('pharmacy');
    expect(params.get('location')).toBe('Enugu');
    expect(params.get('limit')).toBe('20');
    expect(params.get('offset')).toBe('0');
    expect(params.get('specialty')).toBeNull();
  });

  it('omits a zero min rating and false open24', () => {
    const params = new URLSearchParams(buildHospitalsQuery({ minRating: 0, open24: false }));
    expect(params.get('min_rating')).toBeNull();
    expect(params.get('open_24')).toBeNull();
  });

  it('includes a positive rating and open24 flag', () => {
    const params = new URLSearchParams(buildHospitalsQuery({ minRating: 4, open24: true }));
    expect(params.get('min_rating')).toBe('4');
    expect(params.get('open_24')).toBe('true');
  });
});
