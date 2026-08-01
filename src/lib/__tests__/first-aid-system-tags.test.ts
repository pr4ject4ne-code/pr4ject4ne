import { SYSTEM_TAGS, isSystemTag, normalizeSystemTags } from '@/lib/first-aid-system-tags';

describe('isSystemTag', () => {
  it('accepts whitelisted tags', () => {
    expect(isSystemTag('Cardiovascular')).toBe(true);
    expect(isSystemTag('Special Senses')).toBe(true);
    expect(isSystemTag(SYSTEM_TAGS[SYSTEM_TAGS.length - 1])).toBe(true);
  });
  it('rejects unknown strings and non-strings', () => {
    expect(isSystemTag('cardiovascular')).toBe(false); // case-sensitive
    expect(isSystemTag('NotASystem')).toBe(false);
    expect(isSystemTag('')).toBe(false);
    expect(isSystemTag(null)).toBe(false);
    expect(isSystemTag(123)).toBe(false);
    expect(isSystemTag(undefined)).toBe(false);
  });
});

describe('normalizeSystemTags', () => {
  it('keeps only recognised tags', () => {
    expect(normalizeSystemTags(['Cardiovascular', 'bogus', 'Respiratory'])).toEqual([
      'Cardiovascular',
      'Respiratory',
    ]);
  });
  it('de-duplicates while preserving first-seen order', () => {
    expect(normalizeSystemTags(['Respiratory', 'Cardiovascular', 'Respiratory'])).toEqual([
      'Respiratory',
      'Cardiovascular',
    ]);
  });
  it('drops non-string entries', () => {
    expect(normalizeSystemTags(['Nervous', 42, null, { tag: 'Digestive' }])).toEqual(['Nervous']);
  });
  it('returns [] for non-array input', () => {
    expect(normalizeSystemTags(undefined)).toEqual([]);
    expect(normalizeSystemTags('Cardiovascular')).toEqual([]);
    expect(normalizeSystemTags(null)).toEqual([]);
  });
  it('output is always a subset of the whitelist', () => {
    const out = normalizeSystemTags([...SYSTEM_TAGS, 'junk', 'more junk']);
    expect(out).toEqual([...SYSTEM_TAGS]);
    expect(out.every((t) => (SYSTEM_TAGS as readonly string[]).includes(t))).toBe(true);
  });
});
