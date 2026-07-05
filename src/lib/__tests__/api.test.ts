import { parseLimit, parseOffset } from '@/lib/api';

describe('pagination helpers', () => {
  it('clamps limit to defaults and max', () => {
    expect(parseLimit(null)).toBe(20);
    expect(parseLimit('0')).toBe(20);
    expect(parseLimit('-5')).toBe(20);
    expect(parseLimit('10')).toBe(10);
    expect(parseLimit('9999')).toBe(100);
    expect(parseLimit('abc')).toBe(20);
  });

  it('parses offset with a floor of 0', () => {
    expect(parseOffset(null)).toBe(0);
    expect(parseOffset('-3')).toBe(0);
    expect(parseOffset('40')).toBe(40);
    expect(parseOffset('x')).toBe(0);
  });
});
