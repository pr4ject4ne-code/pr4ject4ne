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

  it('skips the radius filter (condition) when any of lat/lng/radius_km is missing', () => {
    // A valid lat+lng alone still binds params (the distance expression is
    // also reused for symptom-match ordering, independent of a radius) — but
    // no `acos(...) <= $n` radius CONDITION is added without a positive
    // radius_km. Missing lat or lng entirely means no distance expression at
    // all, so params stay empty in those two cases.
    const bothCoordsNoRadius = buildHospitalFilters({ lat: '6.44', lng: '7.5' });
    expect(bothCoordsNoRadius.params).toEqual([6.44, 7.5]);
    expect(bothCoordsNoRadius.conditions.some((c) => c.includes('<='))).toBe(false);

    expect(buildHospitalFilters({ lat: '6.44', radiusKm: '10' }).params).toEqual([]);
    expect(buildHospitalFilters({ lng: '7.5', radiusKm: '10' }).params).toEqual([]);
  });

  it('skips the radius filter (condition) for out-of-range lat/lng or a non-positive radius', () => {
    expect(buildHospitalFilters({ lat: '999', lng: '7.5', radiusKm: '10' }).params).toEqual([]);

    const zeroRadius = buildHospitalFilters({ lat: '6.44', lng: '7.5', radiusKm: '0' });
    expect(zeroRadius.params).toEqual([6.44, 7.5]);
    expect(zeroRadius.conditions.some((c) => c.includes('<='))).toBe(false);

    const negativeRadius = buildHospitalFilters({ lat: '6.44', lng: '7.5', radiusKm: '-5' });
    expect(negativeRadius.params).toEqual([6.44, 7.5]);
    expect(negativeRadius.conditions.some((c) => c.includes('<='))).toBe(false);
  });

  describe('symptom search (worklist #8/#34)', () => {
    it('adds a specialty-match condition and an orderBy for a recognised symptom', () => {
      const { conditions, params, orderBy } = buildHospitalFilters({ symptoms: ['Bleeding'] });
      expect(conditions.some((c) => c.includes('unnest(specialties)'))).toBe(true);
      expect(conditions.some((c) => c.includes('> 0'))).toBe(true);
      expect(orderBy).not.toBeNull();
      expect(orderBy).toMatch(/DESC/);
      expect(params[params.length - 1]).toEqual(
        expect.arrayContaining(['%emergency medicine%']),
      );
    });

    it('ignores unrecognised symptom tags (no condition, no orderBy)', () => {
      const { conditions, orderBy } = buildHospitalFilters({ symptoms: ['NotARealSymptom'] });
      expect(conditions).toEqual([`status = 'approved'`]);
      expect(orderBy).toBeNull();
    });

    it('returns orderBy: null when no symptoms are given', () => {
      expect(buildHospitalFilters({}).orderBy).toBeNull();
    });

    it('unions keyword patterns across multiple symptom tags into one ANY() param', () => {
      const { params } = buildHospitalFilters({ symptoms: ['Bleeding', 'Seizures'] });
      const patterns = params[params.length - 1] as string[];
      expect(patterns).toEqual(expect.arrayContaining(['%emergency medicine%', '%neurology%']));
    });

    it('folds distance into the orderBy (ASC) when a location is also given', () => {
      const { orderBy } = buildHospitalFilters({
        symptoms: ['Bleeding'],
        lat: '6.44',
        lng: '7.5',
      });
      expect(orderBy).toMatch(/acos/);
      expect(orderBy).toMatch(/ASC/);
    });
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
