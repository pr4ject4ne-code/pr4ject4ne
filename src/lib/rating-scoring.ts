/**
 * Item 8 — pure scoring logic for the hospital rating system. Kept
 * dependency-free (no DB) so the formula itself is exhaustively unit-tested
 * without a database, matching this project's established pure/DB-wrapper
 * split (e.g. doctor-report.ts vs doctor-consent-db.ts).
 *
 * THE FORMULA (confirmed with the founder, not guessed):
 *  - "In-depth" (per-department) rating = equal-thirds average of three
 *    axes: staff/individuals, service, infrastructure.
 *  - "General" (per-hospital) rating = a single overall score.
 *  - The hospital's combined/ranked score blends the two, with in-depth
 *    weighted 1.8x as heavily as general:
 *      combined = (general * 1 + indepth * 1.8) / (1 + 1.8)
 *    If a hospital has only one type of rating, that one stands alone (no
 *    blending against a nonexistent zero, which would incorrectly drag the
 *    score down).
 *  - An active "association ranking" (an admin-issued official score +
 *    statement, following a dispute) OVERRIDES the community-derived
 *    combined score entirely for display/ranking/filtering purposes — the
 *    community numbers still exist underneath and are still shown
 *    separately for transparency, but sorting/filtering uses the
 *    association figure when one exists.
 */

const INDEPTH_WEIGHT = 1.8;
const GENERAL_WEIGHT = 1;

/** Equal-thirds average of the three in-depth axes for one department rating row. */
export function departmentRatingComposite(staffScore: number, serviceScore: number, infrastructureScore: number): number {
  return (staffScore + serviceScore + infrastructureScore) / 3;
}

/**
 * Blends a hospital's general and in-depth averages into the single combined
 * score used for ranking/filtering. Either input may be `null` (no ratings
 * of that type yet); returns `null` only when BOTH are null (nothing to
 * blend at all — caller should treat this the same as "unrated", not as 0).
 */
export function combinedHospitalScore(generalAvg: number | null, indepthAvg: number | null): number | null {
  if (generalAvg === null && indepthAvg === null) return null;
  if (generalAvg === null) return indepthAvg;
  if (indepthAvg === null) return generalAvg;
  return (generalAvg * GENERAL_WEIGHT + indepthAvg * INDEPTH_WEIGHT) / (GENERAL_WEIGHT + INDEPTH_WEIGHT);
}

/**
 * The score actually used for ranking/filtering/display as "the" hospital
 * rating: an active association ranking overrides the community blend
 * entirely when one exists.
 */
export function effectiveHospitalScore(associationScore: number | null, combinedScore: number | null): number | null {
  return associationScore ?? combinedScore;
}
