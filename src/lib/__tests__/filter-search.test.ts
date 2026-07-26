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

  it('includes ownership and open_day when set', () => {
    const params = new URLSearchParams(
      buildHospitalsQuery({ ownership: 'private', openDay: 'monday' }),
    );
    expect(params.get('ownership')).toBe('private');
    expect(params.get('open_day')).toBe('monday');
  });

  it('omits an empty-string ownership', () => {
    const params = new URLSearchParams(buildHospitalsQuery({ ownership: '' }));
    expect(params.get('ownership')).toBeNull();
  });

  it('includes the radius filter only when radiusKm + lat + lng are all present', () => {
    const full = new URLSearchParams(
      buildHospitalsQuery({ radiusKm: 5, lat: 6.44, lng: 7.5 }),
    );
    expect(full.get('radius_km')).toBe('5');
    expect(full.get('lat')).toBe('6.44');
    expect(full.get('lng')).toBe('7.5');

    const missingCoords = new URLSearchParams(buildHospitalsQuery({ radiusKm: 5 }));
    expect(missingCoords.get('radius_km')).toBeNull();

    const missingRadius = new URLSearchParams(buildHospitalsQuery({ lat: 6.44, lng: 7.5 }));
    expect(missingRadius.get('lat')).toBeNull();
  });
});
