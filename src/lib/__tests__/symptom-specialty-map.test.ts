import { FIRST_AID_TAGS } from '@/lib/first-aid-tags';
import {
  SYMPTOM_ITEMS,
  SYMPTOM_REGIONS,
  REGION_SPECIALTY_MAP,
  normalizeSymptomIds,
  specialtyKeywordsForSymptomIds,
  specialtyLabelsForSymptomIds,
  isSymptomId,
} from '@/lib/symptom-specialty-map';

describe('homepage symptom vocabulary is a SEPARATE closed vocabulary from First Aid', () => {
  it('shares no ids with FIRST_AID_TAGS (distinct systems, per worklist #8/#11)', () => {
    const symptomIds = new Set(SYMPTOM_ITEMS.map((s) => s.id));
    for (const tag of FIRST_AID_TAGS) {
      expect(symptomIds.has(tag)).toBe(false);
    }
  });

  it('every symptom item belongs to a listed region', () => {
    for (const item of SYMPTOM_ITEMS) {
      expect(SYMPTOM_REGIONS).toContain(item.region);
    }
  });

  it('has no duplicate symptom ids', () => {
    const ids = SYMPTOM_ITEMS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('REGION_SPECIALTY_MAP', () => {
  it('has a non-empty keyword list for every region, always including a general/internal medicine fallback', () => {
    for (const region of SYMPTOM_REGIONS) {
      const keywords = REGION_SPECIALTY_MAP[region];
      expect(keywords.length).toBeGreaterThan(0);
      expect(keywords).toEqual(expect.arrayContaining(['general medicine', 'internal medicine']));
    }
  });

  it('never uses the bare "ent" keyword (false-positives on Mental Health/Dental/Adolescent)', () => {
    for (const keywords of Object.values(REGION_SPECIALTY_MAP)) {
      expect(keywords).not.toContain('ent');
    }
    expect(REGION_SPECIALTY_MAP['Ears, nose & throat']).toContain('otolaryngology');
  });

  it('includes both British and American spellings where they differ', () => {
    expect(REGION_SPECIALTY_MAP.Musculoskeletal).toEqual(
      expect.arrayContaining(['orthopaedics', 'orthopedics']),
    );
    expect(REGION_SPECIALTY_MAP['Gynaecological & obstetric']).toEqual(
      expect.arrayContaining(['gynaecology', 'gynecology']),
    );
  });
});

describe('isSymptomId / normalizeSymptomIds', () => {
  it('accepts a whitelisted id and rejects anything else', () => {
    expect(isSymptomId('eye-red-itchy')).toBe(true);
    expect(isSymptomId('NotReal')).toBe(false);
    expect(isSymptomId(42)).toBe(false);
  });

  it('keeps only whitelisted ids, de-duplicated, order-preserving', () => {
    expect(
      normalizeSymptomIds(['eye-red-itchy', 'NotReal', 'eye-red-itchy', 'ent-sore-throat']),
    ).toEqual(['eye-red-itchy', 'ent-sore-throat']);
  });

  it('returns an empty array for non-array input', () => {
    expect(normalizeSymptomIds('eye-red-itchy')).toEqual([]);
    expect(normalizeSymptomIds(undefined)).toEqual([]);
    expect(normalizeSymptomIds(null)).toEqual([]);
  });

  it('drops non-string entries', () => {
    expect(normalizeSymptomIds(['eye-red-itchy', 42, null, {}])).toEqual(['eye-red-itchy']);
  });
});

describe('specialtyKeywordsForSymptomIds', () => {
  it('unions and de-duplicates keywords across multiple symptom ids in different regions', () => {
    const keywords = specialtyKeywordsForSymptomIds(['eye-red-itchy', 'ent-sore-throat']);
    expect(keywords.filter((k) => k === 'general medicine')).toHaveLength(1);
    expect(keywords).toEqual(expect.arrayContaining(['ophthalmology', 'otolaryngology']));
  });

  it('defaults to General/Internal Medicine when no ids resolve to a known region (never unmapped)', () => {
    expect(specialtyKeywordsForSymptomIds([])).toEqual(['general medicine', 'internal medicine']);
    expect(specialtyKeywordsForSymptomIds(['not-a-real-id'])).toEqual([
      'general medicine',
      'internal medicine',
    ]);
  });
});

describe('specialtyLabelsForSymptomIds (non-diagnostic display copy)', () => {
  it('returns a friendly label per distinct region, not the raw ILIKE keywords', () => {
    expect(specialtyLabelsForSymptomIds(['eye-red-itchy'])).toEqual([
      'Ophthalmology / eye clinic',
    ]);
  });

  it('falls back to General medicine for an empty/unresolved symptom set', () => {
    expect(specialtyLabelsForSymptomIds([])).toEqual(['General medicine']);
    expect(specialtyLabelsForSymptomIds(['not-a-real-id'])).toEqual(['General medicine']);
  });

  it('de-duplicates by region across multiple symptoms in the same region', () => {
    expect(specialtyLabelsForSymptomIds(['eye-red-itchy', 'eye-mild-pain'])).toEqual([
      'Ophthalmology / eye clinic',
    ]);
  });
});
