/**
 * Canonical topic/scenario tags for first-aid entries — the second
 * categorization axis (on top of procedure/technique) used for filtering and
 * search. This whitelist is the single source of truth, shared by the authoring
 * form, the public filter, and server-side validation. Tags are a closed set so
 * the catalog stays consistent and no arbitrary strings enter the data.
 */
export const FIRST_AID_TAGS = [
  'Bleeding',
  'Burns',
  'Choking',
  'CPR & breathing',
  'Fractures & sprains',
  'Head & spine',
  'Poisoning',
  'Shock',
  'Wounds & cuts',
  'Bites & stings',
  'Seizures',
  'Heat & cold',
  'Allergic reaction',
  'Drowning',
  'Electric shock',
  'Fainting',
  'Diabetic emergency',
  'Eye injury',
  'Nosebleed',
  'Dental injury',
  'Pregnancy emergency',
  'Foreign object',
  'Stroke',
  'Chest pain',
] as const;

export type FirstAidTag = (typeof FIRST_AID_TAGS)[number];

const ALLOWED = new Set<string>(FIRST_AID_TAGS);

export function isFirstAidTag(value: unknown): value is FirstAidTag {
  return typeof value === 'string' && ALLOWED.has(value);
}

/**
 * Keep only recognised tags from client input, de-duplicated and order-preserving.
 * Unknown strings and non-strings are dropped, so the stored `tags` array is
 * always a subset of FIRST_AID_TAGS.
 */
export function normalizeTags(input: unknown): FirstAidTag[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: FirstAidTag[] = [];
  for (const value of input) {
    if (isFirstAidTag(value) && !seen.has(value)) {
      seen.add(value);
      out.push(value);
    }
  }
  return out;
}
