import { buildHospitalFilters } from '@/lib/hospital-filters';

describe('buildHospitalFilters', () => {
  it('always includes the approved-status base condition with no params', () => {
    const { conditions, params } = buildHospitalFilters({});
    expect(conditions).toEqual([`status = 'approved'`]);
    expect(params).toEqual([]);
  });

  it('composes location + specialty + service_type + min_rating + open_24 + q with AND logic', () => {
    const { conditions, params } = buildHospitalFilters({
      location: 'Enugu',
      specialty: 'Cardiology',
      serviceType: 'hospital',
      minRating: '4',
      open24: 'true',
      q: 'Memfys',
    });
    expect(conditions.length).toBe(7); // status + 6 filters
    expect(conditions[0]).toBe(`status = 'approved'`);
    expect(params).toEqual(['%Enugu%', 'Cardiology', 'hospital', 4, '%Memfys%']);
  });

  it('ignores an invalid service_type rather than erroring', () => {
    const { conditions, params } = buildHospitalFilters({ serviceType: 'not-a-type' });
    expect(conditions).toEqual([`status = 'approved'`]);
    expect(params).toEqual([]);
  });

  it('clamps out-of-range min_rating into [0, 5]', () => {
    const { params } = buildHospitalFilters({ minRating: '99' });
    expect(params).toEqual([5]);
  });

  it('filters on ownership: private maps to is_private = true', () => {
    const { conditions, params } = buildHospitalFilters({ ownership: 'private' });
    expect(conditions).toContain('is_private = $1');
    expect(params).toEqual([true]);
  });

  it('filters on ownership: public maps to is_private = false', () => {
    const { params } = buildHospitalFilters({ ownership: 'public' });
    expect(params).toEqual([false]);
  });

  it('ignores an invalid ownership value', () => {
    const { conditions, params } = buildHospitalFilters({ ownership: 'nonprofit' });
    expect(conditions).toEqual([`status = 'approved'`]);
    expect(params).toEqual([]);
  });

  it('maps a full day name to the stored 3-letter hours key', () => {
    const { conditions, params } = buildHospitalFilters({ openDay: 'Monday' });
    expect(params).toEqual(['mon']);
    expect(conditions.some((c) => c.includes("hours ->> $1"))).toBe(true);
    expect(conditions.some((c) => c.includes("<> 'closed'"))).toBe(true);
  });

  it('accepts the stored short key directly (case-insensitive)', () => {
    const { params } = buildHospitalFilters({ openDay: 'SAT' });
    expect(params).toEqual(['sat']);
  });

  it('ignores an unrecognized day value', () => {
    const { conditions, params } = buildHospitalFilters({ openDay: 'someday' });
    expect(conditions).toEqual([`status = 'approved'`]);
    expect(params).toEqual([]);
  });

  it('adds a haversine radius condition when lat + lng + radius_km are all valid', () => {
    const { conditions, params } = buildHospitalFilters({ lat: '6.44', lng: '7.5', radiusKm: '10' });
    expect(params).toEqual([6.44, 7.5, 10]);
    expect(conditions.some((c) => c.includes('acos'))).toBe(true);
    expect(conditions.some((c) => c.includes('latitude IS NOT NULL'))).toBe(true);
  });

  it('skips the radius filter when any of lat/lng/radius_km is missing', () => {
    expect(buildHospitalFilters({ lat: '6.44', lng: '7.5' }).params).toEqual([]);
    expect(buildHospitalFilters({ lat: '6.44', radiusKm: '10' }).params).toEqual([]);
    expect(buildHospitalFilters({ lng: '7.5', radiusKm: '10' }).params).toEqual([]);
  });

  it('skips the radius filter for out-of-range lat/lng or a non-positive radius', () => {
    expect(buildHospitalFilters({ lat: '999', lng: '7.5', radiusKm: '10' }).params).toEqual([]);
    expect(buildHospitalFilters({ lat: '6.44', lng: '7.5', radiusKm: '0' }).params).toEqual([]);
    expect(buildHospitalFilters({ lat: '6.44', lng: '7.5', radiusKm: '-5' }).params).toEqual([]);
  });

  it('composes all filters together (AND, not override)', () => {
    const { conditions, params } = buildHospitalFilters({
      minRating: '3',
      ownership: 'public',
      openDay: 'sunday',
      lat: '6.44',
      lng: '7.5',
      radiusKm: '20',
    });
    expect(conditions.length).toBe(5); // status + min_rating + ownership + open_day + radius
    expect(params).toEqual([3, false, 'sun', 6.44, 7.5, 20]);
  });
});
