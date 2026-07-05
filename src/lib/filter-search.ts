import type { Hospital } from '@/types';

export interface FilterParams {
  serviceType?: string;
  location?: string;
  specialty?: string;
  minRating?: number;
  open24?: boolean;
  q?: string;
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
