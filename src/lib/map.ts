import type { Coords } from './geolocation';

export interface RouteResult {
  /** Duration in seconds. */
  durationSec: number;
  /** Distance in meters. */
  distanceMeters: number;
  /** Route geometry as [lat, lng] pairs for drawing on Leaflet. */
  geometry: Array<[number, number]>;
}

const OSRM_BASE = process.env.NEXT_PUBLIC_OSRM_URL ?? 'https://router.project-osrm.org';

/**
 * Fetch a driving route (for the map's route line) from the public OSRM demo
 * server. `durationSec` is returned because OSRM includes it, but nothing
 * currently displays it — the ETA number was removed 2026-08-01 (founder
 * decision); only the route geometry is used.
 * OSRM expects lng,lat order. Returns null on any failure so callers degrade
 * gracefully (map still renders without a route line).
 */
export async function fetchRoute(from: Coords, to: Coords): Promise<RouteResult | null> {
  const coords = `${from.lng},${from.lat};${to.lng},${to.lat}`;
  const url = `${OSRM_BASE}/route/v1/driving/${coords}?overview=full&geometries=geojson`;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = await res.json();
    const route = data?.routes?.[0];
    if (!route) return null;
    const geometry: Array<[number, number]> = (route.geometry?.coordinates ?? []).map(
      ([lng, lat]: [number, number]) => [lat, lng],
    );
    return {
      durationSec: route.duration,
      distanceMeters: route.distance,
      geometry,
    };
  } catch {
    return null;
  }
}

/**
 * Forward-geocode a free-text place (area, landmark, address) to coordinates
 * using MapTiler's geocoding API. Biased to Nigeria and, when given, to a
 * nearby point. Returns null on any failure so the caller can show a friendly
 * "couldn't find that" message. Used as the fallback when browser geolocation
 * is denied/unavailable, so "nearest" still works.
 */
export async function geocode(query: string, near?: Coords): Promise<Coords | null> {
  const key = process.env.NEXT_PUBLIC_MAPTILER_KEY;
  const q = query.trim();
  if (!key || !q) return null;
  const proximity = near ? `&proximity=${near.lng},${near.lat}` : '';
  const url = `https://api.maptiler.com/geocoding/${encodeURIComponent(
    q,
  )}.json?key=${key}&country=ng&limit=1${proximity}`;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = await res.json();
    const center = data?.features?.[0]?.center;
    if (!Array.isArray(center) || center.length < 2) return null;
    const [lng, lat] = center;
    if (typeof lat !== 'number' || typeof lng !== 'number') return null;
    return { lat, lng };
  } catch {
    return null;
  }
}

/** Haversine distance in km — used to pick "nearest" client-side. */
export function distanceKm(a: Coords, b: Coords): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(h));
}
