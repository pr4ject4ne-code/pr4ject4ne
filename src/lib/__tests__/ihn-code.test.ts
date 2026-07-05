import { generateIhnCode, isValidIhnCode } from '@/lib/ihn-code';

describe('IHN code', () => {
  it('generates codes in the IHN-XXXX-XXXX-XXXX format', () => {
    for (let i = 0; i < 100; i += 1) {
      const code = generateIhnCode();
      expect(code).toMatch(/^IHN-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
      expect(isValidIhnCode(code)).toBe(true);
    }
  });

  it('excludes ambiguous characters (0, O, 1, I, L)', () => {
    const codes = Array.from({ length: 200 }, () => generateIhnCode()).join('');
    const body = codes.replace(/IHN|-/g, '');
    expect(body).not.toMatch(/[OIL01]/);
  });

  it('produces distinct codes (no obvious collisions)', () => {
    const set = new Set(Array.from({ length: 1000 }, () => generateIhnCode()));
    expect(set.size).toBe(1000);
  });

  it('rejects malformed codes', () => {
    expect(isValidIhnCode('IHN-0000-0000-0000')).toBe(false); // has zeros
    expect(isValidIhnCode('ABC-1234-5678-9012')).toBe(false);
    expect(isValidIhnCode('IHN-ABCD-EFGH')).toBe(false);
    expect(isValidIhnCode('')).toBe(false);
  });
});
