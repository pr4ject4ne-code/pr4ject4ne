import { EMERGENCY_NUMBERS } from '@/lib/emergency-numbers';

describe('EMERGENCY_NUMBERS', () => {
  it('has no duplicate country codes', () => {
    const codes = EMERGENCY_NUMBERS.map((c) => c.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('every entry has a non-empty country name and number', () => {
    for (const entry of EMERGENCY_NUMBERS) {
      expect(entry.country.trim().length).toBeGreaterThan(0);
      expect(entry.number.trim().length).toBeGreaterThan(0);
      expect(entry.code).toMatch(/^[A-Z]{2}$/);
    }
  });

  it('is sorted alphabetically by country name', () => {
    const names = EMERGENCY_NUMBERS.map((c) => c.country);
    const sorted = [...names].sort((a, b) => a.localeCompare(b));
    expect(names).toEqual(sorted);
  });

  it('includes Nigeria without defaulting/pinning it first', () => {
    const nigeria = EMERGENCY_NUMBERS.find((c) => c.code === 'NG');
    expect(nigeria?.number).toBe('112');
    // Alphabetical placement, not pinned to the top — no bias toward it.
    expect(EMERGENCY_NUMBERS[0]?.code).not.toBe('NG');
  });
});
