import type { BiodataLayer, ProfileLayer, SharingPrefs } from '@/types';

/**
 * Default-deny sharing preferences for the IHN cross-user read path
 * (worklist #23). See migration 013 for the full granularity rationale.
 *
 * Grouped by logical section (not one flag per individual field): a
 * reasonable sharing unit ("my blood type" is one decision, not five) that
 * keeps the toggle UI to ~9 switches while still covering every field that
 * exists on BiodataLayer today, so nothing can leak through an uncovered gap.
 */
export const SHARING_PREF_KEYS = [
  'profile',
  'demographics',
  'anthropometrics',
  'chronic_disease',
  'genotype',
  'blood_group',
  'disability',
  'health_preferences',
  'clinical_conditions',
] as const satisfies readonly (keyof SharingPrefs)[];

export const DEFAULT_SHARING_PREFS: SharingPrefs = {
  profile: false,
  demographics: false,
  anthropometrics: false,
  chronic_disease: false,
  genotype: false,
  blood_group: false,
  disability: false,
  health_preferences: false,
  clinical_conditions: false,
};

/**
 * Normalize an arbitrary (possibly missing/garbage) stored value into a full
 * SharingPrefs object. Default-deny: a key only becomes `true` if the input
 * literally has `=== true` for it — any other value (undefined, "true",
 * 1, null, an unknown key) is treated as not-opted-in. This is the ONLY
 * function that should ever read `biodata.sharing_prefs` before it's trusted.
 */
export function normalizeSharingPrefs(input: unknown): SharingPrefs {
  const rec = typeof input === 'object' && input !== null ? (input as Record<string, unknown>) : {};
  const out = { ...DEFAULT_SHARING_PREFS };
  for (const key of SHARING_PREF_KEYS) {
    out[key] = rec[key] === true;
  }
  return out;
}

const DEMOGRAPHIC_FIELDS = ['occupation', 'marital_status', 'religious_status', 'tribe', 'ethnicity'] as const;
const ANTHROPOMETRIC_FIELDS = ['height_cm', 'weight_kg', 'waist_cm', 'chest_cm', 'hip_cm', 'bmi'] as const;

/**
 * The field-level filter for the cross-user IHN read path. Pure and
 * independently testable (no DB/route dependency) so #24/#25 (public
 * "string tab" lookup) can reuse it unchanged.
 *
 * Default-deny: a section's fields are included ONLY if `prefs[section]` is
 * literally `true`. Any field belonging to a section that is false/absent is
 * omitted entirely from the result (not nulled, not present-but-empty) —
 * verified by a dedicated field-level isolation test.
 */
export function filterBiodataBySharingPrefs(
  profileLayer: ProfileLayer,
  biodataLayer: BiodataLayer,
  prefs: SharingPrefs,
): { profile_layer: Partial<ProfileLayer>; biodata_layer: Partial<BiodataLayer> } {
  const profile_layer: Partial<ProfileLayer> = prefs.profile ? { ...profileLayer } : {};
  // ProfileLayer's own doc comment: "freely visible (except DOB, gated by
  // dob_visible)". The `profile` sharing toggle grants everything else in
  // the layer, but must still respect that pre-existing per-field opt-out —
  // otherwise turning on profile sharing would silently bypass a control the
  // owner set for a different reason (e.g. general profile-page visibility).
  if (profile_layer.dob !== undefined && profile_layer.dob_visible !== true) {
    delete profile_layer.dob;
  }
  const biodata_layer: Partial<BiodataLayer> = {};

  if (prefs.demographics) {
    for (const key of DEMOGRAPHIC_FIELDS) {
      if (biodataLayer[key] !== undefined) (biodata_layer as Record<string, unknown>)[key] = biodataLayer[key];
    }
  }
  if (prefs.anthropometrics) {
    for (const key of ANTHROPOMETRIC_FIELDS) {
      if (biodataLayer[key] !== undefined) (biodata_layer as Record<string, unknown>)[key] = biodataLayer[key];
    }
  }
  if (prefs.chronic_disease && biodataLayer.chronic_disease !== undefined) {
    biodata_layer.chronic_disease = biodataLayer.chronic_disease;
  }
  if (prefs.genotype && biodataLayer.genotype !== undefined) {
    biodata_layer.genotype = biodataLayer.genotype;
  }
  if (prefs.blood_group && biodataLayer.blood_group !== undefined) {
    biodata_layer.blood_group = biodataLayer.blood_group;
  }
  if (prefs.disability && biodataLayer.disability !== undefined) {
    biodata_layer.disability = biodataLayer.disability;
  }
  if (prefs.health_preferences && biodataLayer.health_preferences !== undefined) {
    biodata_layer.health_preferences = biodataLayer.health_preferences;
  }
  if (prefs.clinical_conditions && biodataLayer.clinical_conditions !== undefined) {
    biodata_layer.clinical_conditions = biodataLayer.clinical_conditions;
  }

  return { profile_layer, biodata_layer };
}
