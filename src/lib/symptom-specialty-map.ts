import { FIRST_AID_TAGS, type FirstAidTag } from './first-aid-tags';

/**
 * Heuristic v1 mapping from a symptom tag (the SAME closed whitelist used by
 * First Aid's `tags`/`signs_symptoms`, src/lib/first-aid-tags.ts) to the
 * specialty keywords a matching hospital is likely to list in its free-text
 * `hospitals.specialties TEXT[]` column.
 *
 * This is deliberately a small static lookup module, not a new schema table —
 * there is no per-hospital "which symptom tags do you handle" data anywhere,
 * and specialties are free text (whatever the registering hospital typed),
 * so any symptom -> hospital link has to go through a fuzzy keyword match.
 * `Record<FirstAidTag, string[]>` keeps this exhaustive: TypeScript will
 * error if a tag from FIRST_AID_TAGS is ever added without a corresponding
 * entry here.
 *
 * Keywords are matched case-insensitively (ILIKE) against each hospital's
 * specialties array — see buildHospitalFilters in hospital-filters.ts. A
 * hospital only needs ONE specialty to contain ONE keyword from ANY selected
 * symptom to match; the match COUNT across selected symptoms then feeds the
 * ranking (specialty-match strength), not just a yes/no filter.
 */
export const SYMPTOM_SPECIALTY_MAP: Record<FirstAidTag, string[]> = {
  Bleeding: ['emergency medicine', 'trauma', 'general surgery', 'general medicine'],
  Burns: ['emergency medicine', 'plastic surgery', 'burns', 'trauma'],
  Choking: ['emergency medicine', 'ent', 'otolaryngology', 'pediatrics'],
  'CPR & breathing': ['cardiology', 'emergency medicine', 'pulmonology', 'critical care'],
  'Fractures & sprains': ['orthopaedics', 'orthopedics', 'trauma', 'physiotherapy'],
  'Head & spine': ['neurology', 'neurosurgery', 'orthopaedics', 'orthopedics', 'trauma'],
  Poisoning: ['emergency medicine', 'toxicology', 'internal medicine', 'gastroenterology'],
  Shock: ['emergency medicine', 'critical care', 'internal medicine', 'cardiology'],
  'Wounds & cuts': ['emergency medicine', 'general surgery', 'trauma', 'general medicine'],
  'Bites & stings': ['emergency medicine', 'infectious disease', 'general medicine', 'toxicology'],
  Seizures: ['neurology', 'emergency medicine', 'pediatrics', 'internal medicine'],
  'Heat & cold': ['emergency medicine', 'internal medicine', 'critical care', 'general medicine'],
  'Allergic reaction': ['emergency medicine', 'immunology', 'allergy', 'internal medicine'],
};

/** Keep only recognised symptom tags, de-duplicated. */
export function normalizeSymptomTags(input: unknown): FirstAidTag[] {
  if (!Array.isArray(input)) return [];
  const allowed = new Set<string>(FIRST_AID_TAGS);
  const seen = new Set<string>();
  const out: FirstAidTag[] = [];
  for (const value of input) {
    if (typeof value === 'string' && allowed.has(value) && !seen.has(value)) {
      seen.add(value);
      out.push(value as FirstAidTag);
    }
  }
  return out;
}

/** Deduplicated specialty keywords for a set of symptom tags. */
export function specialtyKeywordsForSymptoms(tags: FirstAidTag[]): string[] {
  const set = new Set<string>();
  for (const tag of tags) {
    for (const kw of SYMPTOM_SPECIALTY_MAP[tag] ?? []) set.add(kw);
  }
  return Array.from(set);
}
