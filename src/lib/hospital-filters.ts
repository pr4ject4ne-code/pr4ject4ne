import { escapeLikePattern } from './sanitize';
import type { ServiceType } from '@/types';

const SERVICE_TYPES: ServiceType[] = ['hospital', 'clinic', 'pharmacy', 'radiology', 'other'];

/**
 * `hours` is stored as a JSONB object with lowercase 3-letter day keys
 * (see scripts/seed.ts's STANDARD_HOURS: mon/tue/wed/thu/fri/sat/sun).
 * Accept both the stored short keys and full day names (case-insensitive)
 * from the public API's `open_day` param so callers don't need to know the
 * storage shape.
 */
const DAY_KEYS: Record<string, string> = {
  monday: 'mon',
  tuesday: 'tue',
  wednesday: 'wed',
  thursday: 'thu',
  friday: 'fri',
  saturday: 'sat',
  sunday: 'sun',
  mon: 'mon',
  tue: 'tue',
  wed: 'wed',
  thu: 'thu',
  fri: 'fri',
  sat: 'sat',
  sun: 'sun',
};

/** Raw query-param strings as read straight off `URLSearchParams.get(...)`. */
export interface HospitalFilterParams {
  location?: string | null;
  specialty?: string | null;
  serviceType?: string | null;
  minRating?: string | null;
  open24?: string | null;
  q?: string | null;
  ownership?: string | null;
  openDay?: string | null;
  lat?: string | null;
  lng?: string | null;
  radiusKm?: string | null;
}

export interface BuiltHospitalFilters {
  /** Always includes `status = 'approved'` first. Join with ` AND `. */
  conditions: string[];
  /** Positional params matching the `$1, $2, ...` placeholders in conditions. */
  params: unknown[];
}

/**
 * Builds the WHERE-clause conditions + positional params for the public
 * hospitals directory query. Pure (no db access) so it's unit-testable
 * independent of the route handler — mirrors the buildFirstAidQuery /
 * buildHospitalsQuery pattern already used elsewhere in this project.
 */
export function buildHospitalFilters(p: HospitalFilterParams): BuiltHospitalFilters {
  const conditions: string[] = [`status = 'approved'`];
  const params: unknown[] = [];

  if (p.location) {
    params.push(`%${escapeLikePattern(p.location)}%`);
    conditions.push(
      `(city ILIKE $${params.length} ESCAPE '\\' OR address ILIKE $${params.length} ESCAPE '\\')`,
    );
  }

  if (p.specialty) {
    params.push(p.specialty);
    conditions.push(`$${params.length} = ANY (specialties)`);
  }

  if (p.serviceType && SERVICE_TYPES.includes(p.serviceType as ServiceType)) {
    params.push(p.serviceType);
    conditions.push(`service_type = $${params.length}`);
  }

  if (p.minRating && Number.isFinite(Number(p.minRating))) {
    // Clamp to the valid rating range so out-of-range values can't silently
    // become no-op or nonsensical filters.
    const clamped = Math.min(5, Math.max(0, Number(p.minRating)));
    params.push(clamped);
    conditions.push(`rating_avg >= $${params.length}`);
  }

  if (p.open24 === 'true') {
    conditions.push('is_24_hour = TRUE');
  }

  if (p.q) {
    params.push(`%${escapeLikePattern(p.q)}%`);
    conditions.push(`name ILIKE $${params.length} ESCAPE '\\'`);
  }

  if (p.ownership === 'private' || p.ownership === 'public') {
    params.push(p.ownership === 'private');
    conditions.push(`is_private = $${params.length}`);
  }

  const dayKey = p.openDay ? DAY_KEYS[p.openDay.trim().toLowerCase()] : undefined;
  if (dayKey) {
    params.push(dayKey);
    const idx = params.length;
    // Non-null, non-empty, and not literally "closed" — matches the
    // seed data's shape (e.g. sun: "closed").
    conditions.push(
      `(hours ->> $${idx}) IS NOT NULL AND (hours ->> $${idx}) <> '' ` +
        `AND lower(hours ->> $${idx}) <> 'closed'`,
    );
  }

  const lat = p.lat != null ? Number(p.lat) : NaN;
  const lng = p.lng != null ? Number(p.lng) : NaN;
  const radiusKm = p.radiusKm != null ? Number(p.radiusKm) : NaN;
  if (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Number.isFinite(radiusKm) &&
    radiusKm > 0 &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  ) {
    // No PostGIS extension is enabled on this project (only pg_trgm, per
    // migration history) — plain haversine formula in SQL rather than
    // assuming earthdistance/PostGIS availability. LEAST/GREATEST clamp the
    // acos argument to [-1, 1]; floating-point error can push the raw
    // expression slightly outside that range, and Postgres's acos() raises
    // "input is out of range" (not NaN) when it does.
    params.push(lat, lng, radiusKm);
    const latIdx = params.length - 2;
    const lngIdx = params.length - 1;
    const radiusIdx = params.length;
    conditions.push(
      `latitude IS NOT NULL AND longitude IS NOT NULL AND ` +
        `(6371 * acos(LEAST(1, GREATEST(-1, ` +
        `cos(radians($${latIdx})) * cos(radians(latitude)) * cos(radians(longitude) - radians($${lngIdx})) + ` +
        `sin(radians($${latIdx})) * sin(radians(latitude)))))) <= $${radiusIdx}`,
    );
  }

  return { conditions, params };
}
