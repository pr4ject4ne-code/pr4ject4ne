import {
  normalizeSharingPrefs,
  filterBiodataBySharingPrefs,
  DEFAULT_SHARING_PREFS,
  SHARING_PREF_KEYS,
} from '@/lib/sharing-prefs';
import type { BiodataLayer, ProfileLayer } from '@/types';

describe('normalizeSharingPrefs', () => {
  it('defaults every key to false for an empty/missing input', () => {
    expect(normalizeSharingPrefs(undefined)).toEqual(DEFAULT_SHARING_PREFS);
    expect(normalizeSharingPrefs(null)).toEqual(DEFAULT_SHARING_PREFS);
    expect(normalizeSharingPrefs({})).toEqual(DEFAULT_SHARING_PREFS);
  });

  it('only a literal `true` opts a key in — truthy-but-not-true values are denied', () => {
    const out = normalizeSharingPrefs({ blood_group: 1, genotype: 'true', disability: true });
    expect(out.blood_group).toBe(false);
    expect(out.genotype).toBe(false);
    expect(out.disability).toBe(true);
  });

  it('ignores unknown keys', () => {
    const out = normalizeSharingPrefs({ blood_group: true, not_a_real_field: true });
    expect(out.blood_group).toBe(true);
    expect((out as unknown as Record<string, unknown>).not_a_real_field).toBeUndefined();
  });

  it('always returns every whitelisted key', () => {
    const out = normalizeSharingPrefs({ blood_group: true });
    for (const key of SHARING_PREF_KEYS) {
      expect(typeof out[key]).toBe('boolean');
    }
  });
});

describe('filterBiodataBySharingPrefs — field-level isolation (default-deny)', () => {
  const profile: ProfileLayer = { full_name: 'Ada', phone: '0800', email: 'a@b.com' };
  const biodata: BiodataLayer = {
    blood_group: 'O+',
    genotype: 'AA',
    disability: 'None',
    health_preferences: 'Prefers a female doctor',
    chronic_disease: 'Asthma',
    occupation: 'Engineer',
    marital_status: 'Single',
    height_cm: 180,
    weight_kg: 70,
    clinical_conditions: [{ condition: 'Hypertension', timestamp: '2026-01-01T00:00:00Z' }],
  };

  it('returns nothing when every pref is false (true default-deny baseline)', () => {
    const out = filterBiodataBySharingPrefs(profile, biodata, DEFAULT_SHARING_PREFS);
    expect(out.profile_layer).toEqual({});
    expect(out.biodata_layer).toEqual({});
  });

  it('a field NOT explicitly opted in is NEVER returned, even when every OTHER field is opted in', () => {
    const prefs = {
      ...DEFAULT_SHARING_PREFS,
      profile: true,
      demographics: true,
      anthropometrics: true,
      chronic_disease: true,
      disability: true,
      health_preferences: true,
      clinical_conditions: true,
      // genotype and blood_group deliberately left false
    };
    const out = filterBiodataBySharingPrefs(profile, biodata, prefs);
    expect(out.biodata_layer.genotype).toBeUndefined();
    expect(out.biodata_layer.blood_group).toBeUndefined();
    // everything else opted in IS present
    expect(out.biodata_layer.chronic_disease).toBe('Asthma');
    expect(out.biodata_layer.occupation).toBe('Engineer');
    expect(out.biodata_layer.height_cm).toBe(180);
    expect(out.profile_layer.full_name).toBe('Ada');
  });

  it('opting in blood_group alone reveals only blood_group, nothing else', () => {
    const prefs = { ...DEFAULT_SHARING_PREFS, blood_group: true };
    const out = filterBiodataBySharingPrefs(profile, biodata, prefs);
    expect(out.biodata_layer).toEqual({ blood_group: 'O+' });
    expect(out.profile_layer).toEqual({});
  });

  it('profile section is all-or-nothing on the whole profile_layer', () => {
    const out = filterBiodataBySharingPrefs(profile, biodata, { ...DEFAULT_SHARING_PREFS, profile: true });
    expect(out.profile_layer).toEqual(profile);
  });
});
