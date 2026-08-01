/**
 * Canonical body-region tags for first-aid entries — one of two anatomical
 * classification axes (alongside first-aid-system-tags.ts) layered on top of
 * the existing topic/scenario `tags` (first-aid-tags.ts). This whitelist is
 * the single source of truth for validation and (in a later follow-up) the
 * authoring form / public filter. A closed set, same rationale as
 * FIRST_AID_TAGS: keeps the catalog consistent and prevents arbitrary
 * strings from entering the data. See migrations/022_first_aid_region_system_tags.sql.
 */
export const REGION_TAGS = [
  'Head & Neck',
  'Chest',
  'Abdomen',
  'Back & Spine',
  'Upper Limb',
  'Lower Limb',
  'Pelvis & Genitourinary',
  'Skin / Whole Body',
] as const;

export type RegionTag = (typeof REGION_TAGS)[number];

const ALLOWED = new Set<string>(REGION_TAGS);

export function isRegionTag(value: unknown): value is RegionTag {
  return typeof value === 'string' && ALLOWED.has(value);
}

/**
 * Keep only recognised region tags from client input, de-duplicated and
 * order-preserving. Unknown strings and non-strings are dropped, so the
 * stored `region_tags` array is always a subset of REGION_TAGS.
 */
export function normalizeRegionTags(input: unknown): RegionTag[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: RegionTag[] = [];
  for (const value of input) {
    if (isRegionTag(value) && !seen.has(value)) {
      seen.add(value);
      out.push(value);
    }
  }
  return out;
}
