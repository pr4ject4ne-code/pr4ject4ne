/**
 * Deterministic crosswalk from the existing 24 topic/scenario tags
 * (FIRST_AID_TAGS, first-aid-tags.ts) to the two newer anatomical axes:
 * region (first-aid-region-tags.ts) and system (first-aid-system-tags.ts).
 *
 * This is the mapping used to derive starting region/system tags for
 * existing entries (see scripts/backfill-first-aid-region-system-tags.ts)
 * and to keep the three axes coherent going forward. Founder-confirmed
 * decisions baked in here:
 *   - A dedicated "Special Senses" system tag exists specifically so ENT/eye
 *     entries have a proper home: Eye injury -> Special Senses; Nosebleed ->
 *     Special Senses (NOT Respiratory — ENT/nose fits better here).
 *   - Dental injury has NO system tag — teeth aren't a sensory organ, even
 *     with Special Senses added there's no clean fit. Left empty
 *     deliberately, same as Foreign object (also no clean system fit),
 *     rather than forced into a poor match.
 *
 * `TAG_CROSSWALK` is exhaustive over FIRST_AID_TAGS — see
 * first-aid-tag-crosswalk.test.ts for the completeness self-test that
 * guards against a future 25th topic tag silently going unmapped.
 */
import { FIRST_AID_TAGS, type FirstAidTag } from './first-aid-tags';
import type { RegionTag } from './first-aid-region-tags';
import type { SystemTag } from './first-aid-system-tags';

export interface RegionSystemMapping {
  regions: RegionTag[];
  systems: SystemTag[];
}

export const TAG_CROSSWALK: Record<FirstAidTag, RegionSystemMapping> = {
  Choking: { regions: ['Head & Neck'], systems: ['Respiratory'] },
  'CPR & breathing': { regions: ['Chest'], systems: ['Cardiovascular', 'Respiratory'] },
  'Head & spine': {
    regions: ['Head & Neck', 'Back & Spine'],
    systems: ['Nervous', 'Musculoskeletal'],
  },
  Seizures: { regions: ['Head & Neck'], systems: ['Nervous'] },
  Stroke: { regions: ['Head & Neck'], systems: ['Nervous'] },
  'Chest pain': { regions: ['Chest'], systems: ['Cardiovascular'] },
  Drowning: { regions: ['Chest'], systems: ['Respiratory'] },
  Fainting: { regions: ['Head & Neck'], systems: ['Nervous', 'Cardiovascular'] },
  'Allergic reaction': { regions: ['Skin / Whole Body'], systems: ['Immune & Allergic'] },
  'Bites & stings': {
    regions: ['Skin / Whole Body'],
    systems: ['Integumentary', 'Immune & Allergic'],
  },
  Burns: { regions: ['Skin / Whole Body'], systems: ['Integumentary'] },
  Nosebleed: { regions: ['Head & Neck'], systems: ['Special Senses'] },
  'Pregnancy emergency': { regions: ['Pelvis & Genitourinary'], systems: ['Reproductive'] },
  Bleeding: { regions: ['Skin / Whole Body'], systems: ['Cardiovascular'] },
  'Wounds & cuts': { regions: ['Skin / Whole Body'], systems: ['Integumentary'] },
  'Fractures & sprains': {
    regions: ['Upper Limb', 'Lower Limb', 'Back & Spine'],
    systems: ['Musculoskeletal'],
  },
  Shock: { regions: ['Skin / Whole Body'], systems: ['Cardiovascular'] },
  Poisoning: { regions: ['Skin / Whole Body'], systems: ['Digestive'] },
  'Heat & cold': {
    regions: ['Skin / Whole Body'],
    systems: ['Integumentary', 'Endocrine & Metabolic'],
  },
  'Electric shock': { regions: ['Skin / Whole Body'], systems: ['Cardiovascular', 'Nervous'] },
  'Diabetic emergency': { regions: ['Skin / Whole Body'], systems: ['Endocrine & Metabolic'] },
  // No clean fit — left empty deliberately rather than forced.
  'Foreign object': { regions: ['Skin / Whole Body'], systems: [] },
  'Eye injury': { regions: ['Head & Neck'], systems: ['Special Senses'] },
  // No clean system fit even with Special Senses (teeth aren't a sensory
  // organ) — flag for manual review same as any other empty-system entry.
  'Dental injury': { regions: ['Head & Neck'], systems: [] },
};

/**
 * Union the region/system crosswalk across a list of (unvalidated) topic
 * tags, de-duplicating each resulting array. Unknown tag strings are simply
 * ignored (no crosswalk entry to union in). Pure function — no I/O.
 */
export function deriveRegionSystemTags(tags: string[]): RegionSystemMapping {
  const regions: RegionTag[] = [];
  const systems: SystemTag[] = [];
  const seenRegions = new Set<RegionTag>();
  const seenSystems = new Set<SystemTag>();

  for (const tag of tags) {
    const mapping = (TAG_CROSSWALK as Record<string, RegionSystemMapping | undefined>)[tag];
    if (!mapping) continue;
    for (const region of mapping.regions) {
      if (!seenRegions.has(region)) {
        seenRegions.add(region);
        regions.push(region);
      }
    }
    for (const system of mapping.systems) {
      if (!seenSystems.has(system)) {
        seenSystems.add(system);
        systems.push(system);
      }
    }
  }

  return { regions, systems };
}

// Compile-time completeness guard: if a topic tag were ever missing a
// crosswalk key TypeScript would flag TAG_CROSSWALK's type above (Record
// keyed by the full FirstAidTag union). This runtime array only exists so
// the exhaustiveness is also exercised by a normal test run — see
// first-aid-tag-crosswalk.test.ts.
export const CROSSWALK_KEYS = FIRST_AID_TAGS;
