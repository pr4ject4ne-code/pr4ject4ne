import { REGION_TAGS, isRegionTag, normalizeRegionTags } from '@/lib/first-aid-region-tags';

describe('isRegionTag', () => {
  it('accepts whitelisted tags', () => {
    expect(isRegionTag('Head & Neck')).toBe(true);
    expect(isRegionTag(REGION_TAGS[REGION_TAGS.length - 1])).toBe(true);
  });
  it('rejects unknown strings and non-strings', () => {
    expect(isRegionTag('head & neck')).toBe(false); // case-sensitive
    expect(isRegionTag('NotARegion')).toBe(false);
    expect(isRegionTag('')).toBe(false);
    expect(isRegionTag(null)).toBe(false);
    expect(isRegionTag(123)).toBe(false);
    expect(isRegionTag(undefined)).toBe(false);
  });
});

describe('normalizeRegionTags', () => {
  it('keeps only recognised tags', () => {
    expect(normalizeRegionTags(['Chest', 'bogus', 'Abdomen'])).toEqual(['Chest', 'Abdomen']);
  });
  it('de-duplicates while preserving first-seen order', () => {
    expect(normalizeRegionTags(['Abdomen', 'Chest', 'Abdomen'])).toEqual(['Abdomen', 'Chest']);
  });
  it('drops non-string entries', () => {
    expect(normalizeRegionTags(['Chest', 42, null, { tag: 'Abdomen' }])).toEqual(['Chest']);
  });
  it('returns [] for non-array input', () => {
    expect(normalizeRegionTags(undefined)).toEqual([]);
    expect(normalizeRegionTags('Chest')).toEqual([]);
    expect(normalizeRegionTags(null)).toEqual([]);
  });
  it('output is always a subset of the whitelist', () => {
    const out = normalizeRegionTags([...REGION_TAGS, 'junk', 'more junk']);
    expect(out).toEqual([...REGION_TAGS]);
    expect(out.every((t) => (REGION_TAGS as readonly string[]).includes(t))).toBe(true);
  });
});
