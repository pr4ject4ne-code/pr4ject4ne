import { FIRST_AID_TAGS } from '@/lib/first-aid-tags';
import { REGION_TAGS } from '@/lib/first-aid-region-tags';
import { SYSTEM_TAGS } from '@/lib/first-aid-system-tags';
import { TAG_CROSSWALK, deriveRegionSystemTags } from '@/lib/first-aid-tag-crosswalk';

describe('TAG_CROSSWALK completeness', () => {
  it('has a crosswalk entry for every FIRST_AID_TAGS value (so a future 25th tag cannot silently go unmapped)', () => {
    for (const tag of FIRST_AID_TAGS) {
      expect(TAG_CROSSWALK).toHaveProperty(tag);
      expect(TAG_CROSSWALK[tag]).toBeDefined();
    }
    expect(Object.keys(TAG_CROSSWALK).sort()).toEqual([...FIRST_AID_TAGS].sort());
  });

  it('every mapped region/system value is itself whitelisted', () => {
    const regionSet = new Set<string>(REGION_TAGS);
    const systemSet = new Set<string>(SYSTEM_TAGS);
    for (const tag of FIRST_AID_TAGS) {
      const mapping = TAG_CROSSWALK[tag];
      for (const region of mapping.regions) expect(regionSet.has(region)).toBe(true);
      for (const system of mapping.systems) expect(systemSet.has(system)).toBe(true);
    }
  });
});

describe('TAG_CROSSWALK spot-checks', () => {
  it('Chest pain -> {Chest} / {Cardiovascular}', () => {
    expect(TAG_CROSSWALK['Chest pain']).toEqual({
      regions: ['Chest'],
      systems: ['Cardiovascular'],
    });
  });

  it('Eye injury -> {Head & Neck} / {Special Senses}', () => {
    expect(TAG_CROSSWALK['Eye injury']).toEqual({
      regions: ['Head & Neck'],
      systems: ['Special Senses'],
    });
  });

  it('Nosebleed -> {Head & Neck} / {Special Senses} (moved off Respiratory)', () => {
    expect(TAG_CROSSWALK['Nosebleed']).toEqual({
      regions: ['Head & Neck'],
      systems: ['Special Senses'],
    });
  });

  it('Dental injury has an empty system mapping (no clean fit)', () => {
    expect(TAG_CROSSWALK['Dental injury'].systems).toEqual([]);
  });
});

describe('deriveRegionSystemTags', () => {
  it('unions the crosswalk across multiple tags with no duplicates', () => {
    // Chest pain -> Chest / Cardiovascular; Stroke -> Head & Neck / Nervous
    expect(deriveRegionSystemTags(['Chest pain', 'Stroke'])).toEqual({
      regions: ['Chest', 'Head & Neck'],
      systems: ['Cardiovascular', 'Nervous'],
    });
  });

  it('de-duplicates overlapping regions/systems across tags', () => {
    // Bleeding -> Skin/Whole Body / Cardiovascular; Shock -> same pair exactly
    expect(deriveRegionSystemTags(['Bleeding', 'Shock'])).toEqual({
      regions: ['Skin / Whole Body'],
      systems: ['Cardiovascular'],
    });
  });

  it('ignores unknown tag strings', () => {
    expect(deriveRegionSystemTags(['NotARealTag'])).toEqual({ regions: [], systems: [] });
  });

  it('returns empty arrays for an empty input', () => {
    expect(deriveRegionSystemTags([])).toEqual({ regions: [], systems: [] });
  });
});
