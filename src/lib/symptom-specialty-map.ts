/**
 * Stage 2 of the homepage symptom search — region-based, non-emergency
 * specialty routing. See docs/triage-content-review.md for the clinical
 * grounding and the "review before launch" caveat.
 *
 * This is a DELIBERATELY SEPARATE vocabulary from First Aid's own
 * `FIRST_AID_TAGS` whitelist (first-aid-tags.ts). That whitelist stays
 * untouched and scoped to First Aid's own catalog tags/filter — its 13
 * entries (Bleeding, Burns, Choking, CPR & breathing, Fractures & sprains,
 * Head & spine, Poisoning, Shock, Wounds & cuts, Bites & stings, Seizures,
 * Heat & cold, Allergic reaction) are almost all INCIDENT/emergency
 * categories, and using them for the homepage's "which hospital should I
 * search for" question was itself the bug being fixed here: someone with a
 * routine sore throat or mild eye irritation had no non-emergency option to
 * pick from, and anything genuinely urgent belongs in Stage 1's red-flag
 * gate (symptom-red-flags.ts), not a specialty-match ranking.
 *
 * This module instead routes SIMPLE, NON-EMERGENCY, everyday presentations
 * by body region/system — the founder's own framing ("simple ones like eye
 * pain to ophthalmologist ... use a clinical book to understand where
 * symptoms fall in regions and systems"). It is still a CLOSED VOCABULARY
 * (SYMPTOM_ITEMS below) — never free text. Every region's keyword list
 * always includes a `general medicine`/`internal medicine` fallback so a
 * match still happens at a general hospital that doesn't list narrow
 * subspecialties, and `specialtyKeywordsForSymptomIds` itself falls back to
 * General/Internal Medicine if nothing resolves — a symptom search must
 * never come back with nothing to route against.
 *
 * Keywords are matched case-insensitively (ILIKE) against each hospital's
 * free-text `specialties` array — see buildHospitalFilters in
 * hospital-filters.ts. A hospital only needs ONE specialty to contain ONE
 * keyword from ANY selected symptom's region to match; the match COUNT
 * across selected symptoms then feeds the ranking (specialty-match
 * strength), not just a yes/no filter.
 */

export type SymptomRegion =
  | 'Eyes'
  | 'Ears, nose & throat'
  | 'Respiratory'
  | 'Cardiac'
  | 'Musculoskeletal'
  | 'Abdominal'
  | 'Neurological'
  | 'Skin'
  | 'Urological'
  | 'Gynaecological & obstetric'
  | 'Psychiatric'
  | 'Dental'
  | 'Infectious / general';

/** Display order for the region-grouped picker UI. */
export const SYMPTOM_REGIONS: SymptomRegion[] = [
  'Eyes',
  'Ears, nose & throat',
  'Respiratory',
  'Cardiac',
  'Musculoskeletal',
  'Abdominal',
  'Neurological',
  'Skin',
  'Urological',
  'Gynaecological & obstetric',
  'Psychiatric',
  'Dental',
  'Infectious / general',
];

export interface SymptomItem {
  /** Stable key used in the UI/URL. */
  id: string;
  /** User-facing label — a simple, everyday presentation, not a diagnosis. */
  label: string;
  region: SymptomRegion;
}

/**
 * The closed, non-emergency symptom vocabulary. Deliberately simple/base
 * presentations per the founder's direction — anything more complex or
 * ambiguous either belongs in the red-flag gate (symptom-red-flags.ts) or
 * falls back to General Medicine via `specialtyKeywordsForSymptomIds` below.
 */
export const SYMPTOM_ITEMS: SymptomItem[] = [
  { id: 'eye-red-itchy', label: 'Red or itchy eye', region: 'Eyes' },
  { id: 'eye-mild-pain', label: 'Mild eye pain or irritation', region: 'Eyes' },
  { id: 'ent-earache', label: 'Earache', region: 'Ears, nose & throat' },
  { id: 'ent-sore-throat', label: 'Sore throat', region: 'Ears, nose & throat' },
  { id: 'ent-blocked-nose', label: 'Blocked or runny nose', region: 'Ears, nose & throat' },
  { id: 'resp-cough-cold', label: 'Cough or cold symptoms', region: 'Respiratory' },
  {
    id: 'resp-known-asthma',
    label: 'Known asthma, symptoms as usual (not a sudden attack)',
    region: 'Respiratory',
  },
  { id: 'cardiac-palpitations', label: 'Palpitations, without chest pain', region: 'Cardiac' },
  { id: 'cardiac-routine-bp', label: 'Routine blood pressure check', region: 'Cardiac' },
  {
    id: 'msk-simple-sprain',
    label: 'Suspected simple fracture or sprain',
    region: 'Musculoskeletal',
  },
  {
    id: 'msk-joint-back-pain',
    label: 'Joint or back pain, without numbness or weakness',
    region: 'Musculoskeletal',
  },
  { id: 'abd-indigestion', label: 'Indigestion or heartburn', region: 'Abdominal' },
  {
    id: 'abd-mild-recurrent-pain',
    label: 'Mild, recurring abdominal pain',
    region: 'Abdominal',
  },
  { id: 'abd-constipation', label: 'Constipation', region: 'Abdominal' },
  {
    id: 'neuro-typical-headache',
    label: 'Recurring, typical headache or migraine',
    region: 'Neurological',
  },
  {
    id: 'neuro-epilepsy-review',
    label: 'Known, controlled epilepsy — routine review',
    region: 'Neurological',
  },
  { id: 'skin-rash', label: 'Rash, without fever or feeling unwell', region: 'Skin' },
  { id: 'skin-eczema-fungal', label: 'Eczema or suspected fungal infection', region: 'Skin' },
  { id: 'uro-painful-urination', label: 'Painful or frequent urination', region: 'Urological' },
  { id: 'uro-mild-issue', label: 'Other mild urinary issue', region: 'Urological' },
  { id: 'gyn-menstrual', label: 'Menstrual problems', region: 'Gynaecological & obstetric' },
  {
    id: 'gyn-routine-antenatal',
    label: 'Routine antenatal check',
    region: 'Gynaecological & obstetric',
  },
  { id: 'psych-low-mood', label: 'Low mood', region: 'Psychiatric' },
  { id: 'psych-anxiety', label: 'Anxiety', region: 'Psychiatric' },
  { id: 'psych-sleep', label: 'Sleep problems', region: 'Psychiatric' },
  { id: 'dental-toothache', label: 'Toothache or sensitivity', region: 'Dental' },
  { id: 'dental-routine', label: 'Routine dental concern', region: 'Dental' },
  { id: 'infect-fever', label: 'Fever', region: 'Infectious / general' },
  {
    id: 'infect-suspected-malaria-typhoid',
    label: 'Suspected malaria or typhoid',
    region: 'Infectious / general',
  },
];

const GENERAL_MEDICINE_FALLBACK = ['general medicine', 'internal medicine'];

/**
 * Region -> specialty keywords. Both British and American spellings are
 * included where they meaningfully differ (gynaecology/gynecology,
 * orthopaedics/orthopedics — following the same convention already used in
 * hospital-filters.ts's seed/free-text specialty matching). Every region
 * ends with the general-medicine fallback so a hospital that only lists
 * broad services still matches.
 */
export const REGION_SPECIALTY_MAP: Record<SymptomRegion, string[]> = {
  Eyes: ['ophthalmology', 'eye clinic', ...GENERAL_MEDICINE_FALLBACK],
  // 'ent' is deliberately NOT used as a keyword: matched via ILIKE substring
  // against free-text specialties, it false-positives on any specialty
  // containing the substring "ent" (Mental Health, Dental, Adolescent
  // Medicine, etc.) — this exact bug was found and fixed once already today
  // in this file. 'otolaryngology' is the real term and covers this.
  'Ears, nose & throat': ['otolaryngology', ...GENERAL_MEDICINE_FALLBACK],
  Respiratory: ['pulmonology', 'respiratory medicine', ...GENERAL_MEDICINE_FALLBACK],
  Cardiac: ['cardiology', ...GENERAL_MEDICINE_FALLBACK],
  Musculoskeletal: ['orthopaedics', 'orthopedics', 'trauma', ...GENERAL_MEDICINE_FALLBACK],
  Abdominal: ['gastroenterology', ...GENERAL_MEDICINE_FALLBACK],
  Neurological: ['neurology', ...GENERAL_MEDICINE_FALLBACK],
  Skin: ['dermatology', ...GENERAL_MEDICINE_FALLBACK],
  Urological: ['urology', 'nephrology', ...GENERAL_MEDICINE_FALLBACK],
  'Gynaecological & obstetric': [
    'gynaecology',
    'gynecology',
    'obstetrics',
    ...GENERAL_MEDICINE_FALLBACK,
  ],
  Psychiatric: ['psychiatry', 'mental health', ...GENERAL_MEDICINE_FALLBACK],
  Dental: ['dental', 'dentistry', 'oral surgery', ...GENERAL_MEDICINE_FALLBACK],
  'Infectious / general': ['infectious disease', ...GENERAL_MEDICINE_FALLBACK],
};

/** Short, friendly "people with symptoms like this usually see" label per
 * region — used for the non-diagnostic framing copy in the UI, never the
 * raw ILIKE keyword list. */
export const REGION_DISPLAY_SPECIALTY: Record<SymptomRegion, string> = {
  Eyes: 'Ophthalmology / eye clinic',
  'Ears, nose & throat': 'Otolaryngology (ENT)',
  Respiratory: 'Pulmonology / general medicine',
  Cardiac: 'Cardiology / general medicine',
  Musculoskeletal: 'Orthopaedics',
  Abdominal: 'Gastroenterology / general medicine',
  Neurological: 'Neurology / general medicine',
  Skin: 'Dermatology',
  Urological: 'Urology',
  'Gynaecological & obstetric': 'Gynaecology / obstetrics',
  Psychiatric: 'Psychiatry / mental health',
  Dental: 'Dental',
  'Infectious / general': 'General medicine',
};

const SYMPTOM_ITEM_BY_ID = new Map(SYMPTOM_ITEMS.map((s) => [s.id, s]));
const VALID_SYMPTOM_IDS = new Set(SYMPTOM_ITEMS.map((s) => s.id));

export function isSymptomId(value: unknown): value is string {
  return typeof value === 'string' && VALID_SYMPTOM_IDS.has(value);
}

/** Keep only whitelisted symptom ids, de-duplicated, order-preserving. */
export function normalizeSymptomIds(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of input) {
    if (isSymptomId(value) && !seen.has(value)) {
      seen.add(value);
      out.push(value);
    }
  }
  return out;
}

/**
 * Deduplicated specialty keywords for a set of symptom ids, resolved
 * through each symptom's region. Falls back to the General/Internal
 * Medicine keywords when no id resolves to a known region (should not
 * normally happen from a closed-vocabulary UI, but guards the "never leave
 * a symptom unmapped" requirement defensively — e.g. against a stale/
 * malformed URL param).
 */
export function specialtyKeywordsForSymptomIds(ids: string[]): string[] {
  const set = new Set<string>();
  for (const id of ids) {
    const item = SYMPTOM_ITEM_BY_ID.get(id);
    if (!item) continue;
    for (const kw of REGION_SPECIALTY_MAP[item.region]) set.add(kw);
  }
  if (set.size === 0) {
    for (const kw of GENERAL_MEDICINE_FALLBACK) set.add(kw);
  }
  return Array.from(set);
}

/** Friendly "usually see" specialty labels for the non-diagnostic framing
 * copy — one per distinct region among the given symptom ids, in region
 * display order. Falls back to "General medicine" for an empty/unresolved set. */
export function specialtyLabelsForSymptomIds(ids: string[]): string[] {
  const regions = new Set<SymptomRegion>();
  for (const id of ids) {
    const item = SYMPTOM_ITEM_BY_ID.get(id);
    if (item) regions.add(item.region);
  }
  if (regions.size === 0) return ['General medicine'];
  return SYMPTOM_REGIONS.filter((r) => regions.has(r)).map((r) => REGION_DISPLAY_SPECIALTY[r]);
}
