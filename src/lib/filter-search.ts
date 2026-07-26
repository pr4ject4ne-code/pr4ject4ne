import type { Hospital } from '@/types';

export interface FilterParams {
  serviceType?: string;
  location?: string;
  specialty?: string;
  minRating?: number;
  open24?: boolean;
  q?: string;
  /** Private vs. public/government ownership (worklist #13). */
  ownership?: 'private' | 'public' | '';
  /** Day name, e.g. "monday" — filters to hospitals open that day. */
  openDay?: string;
  /** Distance-radius filter; lat/lng are required alongside radiusKm or it's a no-op. */
  radiusKm?: number;
  lat?: number;
  lng?: number;
  /** Whitelisted symptom tags (worklist #8/#34) — sent as a comma-joined list. */
  symptoms?: string[];
  limit?: number;
  offset?: number;
}

export interface FilterResults {
  hospitals: Hospital[];
  total: number;
  limit: number;
  offset: number;
}

/** Build the querystring for the hospitals API from filter params. */
export function buildHospitalsQuery(params: FilterParams): string {
  const sp = new URLSearchParams();
  if (params.serviceType) sp.set('service_type', params.serviceType);
  if (params.location) sp.set('location', params.location);
  if (params.specialty) sp.set('specialty', params.specialty);
  if (typeof params.minRating === 'number' && params.minRating > 0) {
    sp.set('min_rating', String(params.minRating));
  }
  if (params.open24) sp.set('open_24', 'true');
  if (params.q) sp.set('q', params.q);
  if (params.ownership) sp.set('ownership', params.ownership);
  if (params.openDay) sp.set('open_day', params.openDay);
  // radius filter only makes sense with a coordinate to measure from — a
  // radius without lat/lng (or vice versa) is silently dropped rather than
  // sent as a half-formed, no-op filter.
  if (
    typeof params.radiusKm === 'number' &&
    params.radiusKm > 0 &&
    typeof params.lat === 'number' &&
    typeof params.lng === 'number'
  ) {
    sp.set('radius_km', String(params.radiusKm));
    sp.set('lat', String(params.lat));
    sp.set('lng', String(params.lng));
  }
  if (params.symptoms && params.symptoms.length > 0) {
    sp.set('symptom', params.symptoms.join(','));
  }
  sp.set('limit', String(params.limit ?? 20));
  sp.set('offset', String(params.offset ?? 0));
  return sp.toString();
}

export async function fetchFilteredHospitals(params: FilterParams): Promise<FilterResults> {
  const res = await fetch(`/api/hospitals?${buildHospitalsQuery(params)}`);
  const data = await res.json();
  return {
    hospitals: data.hospitals ?? [],
    total: data.total ?? 0,
    limit: data.limit ?? 20,
    offset: data.offset ?? 0,
  };
}
