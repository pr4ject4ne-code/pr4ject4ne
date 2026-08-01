'use client';

import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import type {
  Map as MLMap,
  Marker as MLMarker,
  StyleSpecification,
  PaddingOptions,
} from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { Coords } from '@/lib/geolocation';
import type { Hospital } from '@/types';

interface MapProps {
  center: Coords;
  userLocation?: Coords | null;
  hospitals: Hospital[];
  routeGeometry?: Array<[number, number]> | null;
  onSelectHospital?: (id: string) => void;
  /** The one hospital pin to render in green (founder ask, 2026-07-29:
   * "only the selected pin should be colored green") — every other pin stays
   * the default color regardless of distance/rank. `null`/undefined means no
   * pin is selected yet. */
  selectedHospitalId?: string | null;
}

// Theme colors (kept in sync with globals.css tokens).
const COLOR_AMETHYST = '#7b5aa6';
const COLOR_HIGHLIGHT = '#12b5c9'; // route polyline
const COLOR_SELECTED = '#2e7d4f'; // the one pin the user has tapped
const COLOR_BLUE = '#3f6dc7';

const MAPTILER_KEY = process.env.NEXT_PUBLIC_MAPTILER_KEY;
// Vector basemap style. Swap via env without touching code (e.g. streets-v2,
// streets-v2-light, dataviz-light, basic-v2).
const MAP_STYLE = process.env.NEXT_PUBLIC_MAP_STYLE ?? 'streets-v2';

/**
 * Resolve the MapLibre style. With a MapTiler key we use their vector tiles
 * (smooth zoom/rotate, modern cartography). Without one, we degrade to a raster
 * OpenStreetMap style so the map still renders in local dev / CI without secrets.
 */
function resolveStyle(): string | StyleSpecification {
  if (MAPTILER_KEY) {
    return `https://api.maptiler.com/maps/${MAP_STYLE}/style.json?key=${MAPTILER_KEY}`;
  }
  return {
    version: 8,
    sources: {
      osm: {
        type: 'raster',
        tiles: [
          'https://a.tile.openstreetmap.org/{z}/{x}/{y}.png',
          'https://b.tile.openstreetmap.org/{z}/{x}/{y}.png',
          'https://c.tile.openstreetmap.org/{z}/{x}/{y}.png',
        ],
        tileSize: 256,
        attribution: '&copy; OpenStreetMap contributors',
      },
    },
    layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
  };
}

/**
 * Build a pinpoint teardrop marker element. The tip of the pin sits exactly on
 * the coordinate (MapLibre anchor 'bottom'), so hospitals are pinpointed rather
 * than covered by a blob. `.re-pin` styling (drop shadow) lives in globals.css.
 */
function pinElement(color: string, size = 36): HTMLDivElement {
  const w = size * 0.72;
  const el = document.createElement('div');
  el.className = 're-pin';
  el.innerHTML = `<svg width="${w}" height="${size}" viewBox="0 0 24 34" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M12 0C5.37 0 0 5.37 0 12c0 8.4 12 22 12 22s12-13.6 12-22C24 5.37 18.63 0 12 0z" fill="${color}"/>
    <circle cx="12" cy="12" r="4.6" fill="#ffffff"/>
  </svg>`;
  return el;
}

/**
 * Padding for fitBounds. The map no longer shares the viewport with a
 * floating results panel (no docked side panel, no bottom sheet) — it lives
 * in its own in-flow section — so one modest fixed padding on every side is
 * enough to keep framed content off the panel's edges.
 */
function framePadding(): PaddingOptions {
  return { top: 40, right: 40, bottom: 40, left: 40 };
}

/**
 * MapLibre GL + MapTiler map, sized entirely by its container (the caller's
 * job — see HomeClient.tsx's expandable `.mapPanel`). Loaded client-only
 * (dynamic import in HomeClient) since MapLibre touches `window`. Hospitals
 * render as teardrop pins; the nearest is highlighted teal; an OSRM route is
 * overlaid and the view is framed to the route when present.
 */
export default function Map({
  center,
  userLocation,
  hospitals,
  routeGeometry,
  onSelectHospital,
  selectedHospitalId,
}: MapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const markersRef = useRef<MLMarker[]>([]);
  // Flips true once the style has loaded, so the marker/route effects only run
  // after sources/layers can be added.
  const [ready, setReady] = useState(false);

  // Initialize the map once.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: resolveStyle(),
      center: [center.lng, center.lat],
      zoom: 13,
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
    mapRef.current = map;
    map.on('load', () => setReady(true));

    // MapLibre tracks window resize itself, but this container's own size can
    // also change independently (layout shifts, and — since this container is
    // width:100%/height:100% of HomeClient's expandable `.mapPanel` — the
    // collapsed/expanded CSS height transition). ResizeObserver fires on every
    // box-size change, which per spec is throttled to roughly once per
    // animation frame, so this keeps tiles correctly sized throughout that
    // transition, not just once it settles.
    const ro = new ResizeObserver(() => map.resize());
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
      setReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Redraw markers when hospitals or user location change.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    if (userLocation) {
      const dot = document.createElement('div');
      dot.className = 're-user-dot';
      const marker = new maplibregl.Marker({ element: dot, anchor: 'center' })
        .setLngLat([userLocation.lng, userLocation.lat])
        .setPopup(new maplibregl.Popup({ offset: 14 }).setText('You are here'))
        .addTo(map);
      markersRef.current.push(marker);
    }

    // Only the explicitly-selected pin (a tap, or the auto-routed nearest
    // once a route exists) is colored differently — no more automatically
    // highlighting "nearest" just because a location is known.
    hospitals.forEach((h) => {
      if (typeof h.latitude !== 'number' || typeof h.longitude !== 'number') return;
      const isSelected = Boolean(selectedHospitalId) && h.id === selectedHospitalId;
      const size = isSelected ? 44 : 36;
      const el = pinElement(isSelected ? COLOR_SELECTED : COLOR_AMETHYST, size);
      if (isSelected) el.style.zIndex = '2';
      const popup = new maplibregl.Popup({ offset: [0, -size + 6] }).setHTML(
        `<strong>${escapeHtml(h.name)}</strong><br/>${escapeHtml(h.address ?? '')}`,
      );
      const marker = new maplibregl.Marker({ element: el, anchor: 'bottom' })
        .setLngLat([h.longitude, h.latitude])
        .setPopup(popup)
        .addTo(map);
      if (onSelectHospital) el.addEventListener('click', () => onSelectHospital(h.id));
      markersRef.current.push(marker);
    });
  }, [hospitals, userLocation, onSelectHospital, selectedHospitalId, ready]);

  // Draw/replace the route polyline and frame the view to it.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const hasRoute = Boolean(routeGeometry && routeGeometry.length > 1);
    // GeoJSON wants [lng, lat]; our geometry is [lat, lng].
    const line = hasRoute
      ? routeGeometry!.map(([lat, lng]) => [lng, lat] as [number, number])
      : [];
    const data = {
      type: 'Feature' as const,
      geometry: { type: 'LineString' as const, coordinates: line },
      properties: {},
    };

    const existing = map.getSource('route') as maplibregl.GeoJSONSource | undefined;
    if (existing) {
      existing.setData(data);
    } else {
      map.addSource('route', { type: 'geojson', data });
      // Wide translucent glow beneath a solid line → a "liquid" highlighted route.
      map.addLayer({
        id: 'route-glow',
        type: 'line',
        source: 'route',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': COLOR_HIGHLIGHT, 'line-width': 11, 'line-opacity': 0.25 },
      });
      map.addLayer({
        id: 'route-line',
        type: 'line',
        source: 'route',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': COLOR_HIGHLIGHT, 'line-width': 4, 'line-opacity': 0.95 },
      });
    }

    // Frame the whole route (+ the user) instead of leaving it off-screen at a
    // fixed zoom.
    if (hasRoute) {
      const bounds = new maplibregl.LngLatBounds();
      line.forEach((c) => bounds.extend(c));
      if (userLocation) bounds.extend([userLocation.lng, userLocation.lat]);
      map.fitBounds(bounds, { padding: framePadding(), maxZoom: 15, duration: 700 });
    }
  }, [routeGeometry, userLocation, ready]);

  // Frame the view. A route (above) owns the view when present. Otherwise, frame
  // all hospital pins so the map opens showing every result rather than a fixed
  // center with most pins off-screen. Refit on a genuinely new result set (the
  // top result changes) but NOT on "load more" (same top result, appended) or on
  // pan/zoom. With a user location we defer to the center/route flow instead.
  const lastTopIdRef = useRef<string | null>(null);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    if (routeGeometry && routeGeometry.length > 1) return;

    const topId = hospitals[0]?.id ?? null;
    const isNewSet = topId !== lastTopIdRef.current;
    lastTopIdRef.current = topId;

    const coords = hospitals
      .filter((h) => typeof h.latitude === 'number' && typeof h.longitude === 'number')
      .map((h) => [h.longitude as number, h.latitude as number] as [number, number]);

    if (!userLocation && isNewSet && coords.length > 0) {
      const bounds = new maplibregl.LngLatBounds();
      coords.forEach((c) => bounds.extend(c));
      map.fitBounds(bounds, { padding: framePadding(), maxZoom: 14, duration: 600 });
      return;
    }
    map.easeTo({ center: [center.lng, center.lat], duration: 500 });
  }, [center.lat, center.lng, hospitals, userLocation, ready, routeGeometry]);

  return (
    <div ref={containerRef} data-testid="maplibre-map" style={{ width: '100%', height: '100%' }} />
  );
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      default:
        return '&#39;';
    }
  });
}
