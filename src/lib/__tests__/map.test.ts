import { formatEta, distanceKm } from '@/lib/map';

describe('formatEta', () => {
  it('formats minutes under an hour', () => {
    expect(formatEta(0)).toBe('0 min');
    expect(formatEta(90)).toBe('2 min');
    expect(formatEta(59 * 60)).toBe('59 min');
  });
  it('formats hours and minutes', () => {
    expect(formatEta(60 * 60)).toBe('1h');
    expect(formatEta(90 * 60)).toBe('1h 30m');
    expect(formatEta(125 * 60)).toBe('2h 5m');
  });
});

describe('distanceKm', () => {
  it('is ~0 for identical points', () => {
    expect(distanceKm({ lat: 6.45, lng: 7.5 }, { lat: 6.45, lng: 7.5 })).toBeCloseTo(0, 5);
  });
  it('computes a positive distance between distinct points', () => {
    const d = distanceKm({ lat: 6.45, lng: 7.5 }, { lat: 6.55, lng: 7.6 });
    expect(d).toBeGreaterThan(10);
    expect(d).toBeLessThan(20);
  });
});
