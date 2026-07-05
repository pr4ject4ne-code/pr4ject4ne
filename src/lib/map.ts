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
 * Fetch a driving route + ETA from the public OSRM demo server.
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

/** Format an OSRM duration (seconds) into a compact ETA string. */
export function formatEta(durationSec: number): string {
  const mins = Math.round(durationSec / 60);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
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
