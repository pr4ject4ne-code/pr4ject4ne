import { sanitizeText } from '@/lib/sanitize';

describe('sanitizeText', () => {
  it('escapes angle brackets', () => {
    expect(sanitizeText('<script>alert(1)</script>')).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
  });
  it('returns null for non-strings', () => {
    expect(sanitizeText(undefined)).toBeNull();
    expect(sanitizeText(42)).toBeNull();
  });
  it('truncates to max length', () => {
    expect(sanitizeText('abcdef', 3)).toBe('abc');
  });
  it('passes through safe text unchanged', () => {
    expect(sanitizeText('Apply pressure to the wound.')).toBe('Apply pressure to the wound.');
  });
});
