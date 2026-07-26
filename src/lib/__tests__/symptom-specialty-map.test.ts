import { FIRST_AID_TAGS } from '@/lib/first-aid-tags';
import {
  SYMPTOM_SPECIALTY_MAP,
  normalizeSymptomTags,
  specialtyKeywordsForSymptoms,
} from '@/lib/symptom-specialty-map';

describe('SYMPTOM_SPECIALTY_MAP', () => {
  it('has a non-empty keyword list for every whitelisted symptom tag', () => {
    for (const tag of FIRST_AID_TAGS) {
      expect(SYMPTOM_SPECIALTY_MAP[tag]).toBeDefined();
      expect(SYMPTOM_SPECIALTY_MAP[tag].length).toBeGreaterThan(0);
    }
  });
});

describe('normalizeSymptomTags', () => {
  it('keeps only whitelisted tags, de-duplicated, order-preserving', () => {
    expect(normalizeSymptomTags(['Bleeding', 'NotReal', 'Bleeding', 'Burns'])).toEqual([
      'Bleeding',
      'Burns',
    ]);
  });

  it('returns an empty array for non-array input', () => {
    expect(normalizeSymptomTags('Bleeding')).toEqual([]);
    expect(normalizeSymptomTags(undefined)).toEqual([]);
    expect(normalizeSymptomTags(null)).toEqual([]);
  });

  it('drops non-string entries', () => {
    expect(normalizeSymptomTags(['Bleeding', 42, null, {}])).toEqual(['Bleeding']);
  });
});

describe('specialtyKeywordsForSymptoms', () => {
  it('unions and de-duplicates keywords across multiple symptom tags', () => {
    const keywords = specialtyKeywordsForSymptoms(['Bleeding', 'Wounds & cuts']);
    // Both tags include 'emergency medicine' and 'trauma' — should appear once each.
    expect(keywords.filter((k) => k === 'emergency medicine')).toHaveLength(1);
    expect(keywords.filter((k) => k === 'trauma')).toHaveLength(1);
    expect(keywords).toEqual(expect.arrayContaining(['emergency medicine', 'trauma']));
  });

  it('returns an empty array for no symptom tags', () => {
    expect(specialtyKeywordsForSymptoms([])).toEqual([]);
  });
});
