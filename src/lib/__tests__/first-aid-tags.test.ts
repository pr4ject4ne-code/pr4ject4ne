import { FIRST_AID_TAGS, isFirstAidTag, normalizeTags } from '@/lib/first-aid-tags';

describe('isFirstAidTag', () => {
  it('accepts whitelisted tags', () => {
    expect(isFirstAidTag('Bleeding')).toBe(true);
    expect(isFirstAidTag(FIRST_AID_TAGS[FIRST_AID_TAGS.length - 1])).toBe(true);
  });
  it('rejects unknown strings and non-strings', () => {
    expect(isFirstAidTag('bleeding')).toBe(false); // case-sensitive
    expect(isFirstAidTag('NotATag')).toBe(false);
    expect(isFirstAidTag('')).toBe(false);
    expect(isFirstAidTag(null)).toBe(false);
    expect(isFirstAidTag(123)).toBe(false);
    expect(isFirstAidTag(undefined)).toBe(false);
  });
});

describe('normalizeTags', () => {
  it('keeps only recognised tags', () => {
    expect(normalizeTags(['Bleeding', 'bogus', 'Burns'])).toEqual(['Bleeding', 'Burns']);
  });
  it('de-duplicates while preserving first-seen order', () => {
    expect(normalizeTags(['Burns', 'Bleeding', 'Burns'])).toEqual(['Burns', 'Bleeding']);
  });
  it('drops non-string entries', () => {
    expect(normalizeTags(['Choking', 42, null, { tag: 'Shock' }])).toEqual(['Choking']);
  });
  it('returns [] for non-array input', () => {
    expect(normalizeTags(undefined)).toEqual([]);
    expect(normalizeTags('Bleeding')).toEqual([]);
    expect(normalizeTags(null)).toEqual([]);
  });
  it('output is always a subset of the whitelist', () => {
    const out = normalizeTags([...FIRST_AID_TAGS, 'junk', 'more junk']);
    expect(out).toEqual([...FIRST_AID_TAGS]);
    expect(out.every((t) => (FIRST_AID_TAGS as readonly string[]).includes(t))).toBe(true);
  });
});
