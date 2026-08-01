import { distanceKm } from '@/lib/map';

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
