/**
 * Canonical body-system tags for first-aid entries — the second anatomical
 * classification axis (alongside first-aid-region-tags.ts) layered on top of
 * the existing topic/scenario `tags` (first-aid-tags.ts). This whitelist is
 * the single source of truth for validation and (in a later follow-up) the
 * authoring form / public filter. A closed set, same rationale as
 * FIRST_AID_TAGS: keeps the catalog consistent and prevents arbitrary
 * strings from entering the data.
 *
 * Includes a dedicated "Special Senses" tag (founder-confirmed decision) so
 * ENT/eye-organ entries (Eye injury, Nosebleed) have a proper home instead of
 * being forced under Respiratory/other ill-fitting systems. See
 * migrations/022_first_aid_region_system_tags.sql and
 * first-aid-tag-crosswalk.ts for how the existing 24 topic tags map here.
 */
export const SYSTEM_TAGS = [
  'Cardiovascular',
  'Respiratory',
  'Nervous',
  'Musculoskeletal',
  'Digestive',
  'Integumentary',
  'Renal & Urinary',
  'Endocrine & Metabolic',
  'Immune & Allergic',
  'Reproductive',
  'Special Senses',
] as const;

export type SystemTag = (typeof SYSTEM_TAGS)[number];

const ALLOWED = new Set<string>(SYSTEM_TAGS);

export function isSystemTag(value: unknown): value is SystemTag {
  return typeof value === 'string' && ALLOWED.has(value);
}

/**
 * Keep only recognised system tags from client input, de-duplicated and
 * order-preserving. Unknown strings and non-strings are dropped, so the
 * stored `system_tags` array is always a subset of SYSTEM_TAGS.
 */
export function normalizeSystemTags(input: unknown): SystemTag[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: SystemTag[] = [];
  for (const value of input) {
    if (isSystemTag(value) && !seen.has(value)) {
      seen.add(value);
      out.push(value);
    }
  }
  return out;
}
