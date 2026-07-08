'use client';

import { useEffect, useRef, useState } from 'react';
import type * as Leaflet from 'leaflet';
import type { Map as LeafletMap, LayerGroup } from 'leaflet';
import type { Coords } from '@/lib/geolocation';
import type { Hospital } from '@/types';

interface MapProps {
  center: Coords;
  userLocation?: Coords | null;
  hospitals: Hospital[];
  routeGeometry?: Array<[number, number]> | null;
  onSelectHospital?: (id: string) => void;
}

const TILE_URL =
  process.env.NEXT_PUBLIC_OSM_TILE_URL ?? 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

// Theme colors (kept in sync with globals.css tokens).
const COLOR_AMETHYST = '#7b5aa6';
const COLOR_HIGHLIGHT = '#12b5c9';
const COLOR_BLUE = '#3f6dc7';

/**
 * Build a pinpoint teardrop marker as a Leaflet divIcon. The tip of the pin
 * sits exactly on the coordinate (iconAnchor at bottom-center), so hospitals
 * are pinpointed rather than covered by a blob. `.re-pin` styling (transparent
 * background + drop shadow) lives in globals.css.
 */
function pinIcon(L: typeof Leaflet, color: string, size = 36) {
  const w = size * 0.72;
  const html = `<svg width="${w}" height="${size}" viewBox="0 0 24 34" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M12 0C5.37 0 0 5.37 0 12c0 8.4 12 22 12 22s12-13.6 12-22C24 5.37 18.63 0 12 0z" fill="${color}"/>
    <circle cx="12" cy="12" r="4.6" fill="#ffffff"/>
  </svg>`;
  return L.divIcon({
    html,
    className: 're-pin',
    iconSize: [w, size],
    iconAnchor: [w / 2, size],
    popupAnchor: [0, -size + 6],
  });
}

/**
 * Full-bleed Leaflet + OpenStreetMap map. Leaflet is imported dynamically so it
 * only loads in the browser (it references `window`). Markers are drawn for each
 * hospital; a route polyline is overlaid when provided.
 */
export default function Map({
  center,
  userLocation,
  hospitals,
  routeGeometry,
  onSelectHospital,
}: MapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markerLayerRef = useRef<LayerGroup | null>(null);
  const routeLayerRef = useRef<LayerGroup | null>(null);
  // Flips true once the async Leaflet init finishes. The marker/route effects
  // gate on it so props that are already present at mount (fast data, or the
  // demo page) still draw once the map + layer groups exist.
  const [ready, setReady] = useState(false);

  // Initialize the map once.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import('leaflet')).default;
      await import('leaflet/dist/leaflet.css');
      if (cancelled || !containerRef.current || mapRef.current) return;

      const map = L.map(containerRef.current, {
        center: [center.lat, center.lng],
        zoom: 13,
      });
      L.tileLayer(TILE_URL, {
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: 19,
      }).addTo(map);
      markerLayerRef.current = L.layerGroup().addTo(map);
      routeLayerRef.current = L.layerGroup().addTo(map);
      mapRef.current = map;
      setReady(true);
    })();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      setReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-center when the center changes.
  useEffect(() => {
    mapRef.current?.setView([center.lat, center.lng]);
  }, [center.lat, center.lng]);

  // Redraw markers when hospitals or user location change.
  useEffect(() => {
    (async () => {
      const L = (await import('leaflet')).default;
      const layer = markerLayerRef.current;
      if (!layer) return;
      layer.clearLayers();

      if (userLocation) {
        // "You are here" — blue dot with a soft white ring, distinct from pins.
        L.circleMarker([userLocation.lat, userLocation.lng], {
          radius: 8,
          color: '#ffffff',
          weight: 3,
          fillColor: COLOR_BLUE,
          fillOpacity: 1,
        })
          .bindPopup('You are here')
          .addTo(layer);
      }

      // When we know the user's location the list is proximity-ordered, so the
      // first hospital with coordinates is the nearest — highlight it in teal.
      let highlightedNearest = false;
      hospitals.forEach((h) => {
        if (typeof h.latitude !== 'number' || typeof h.longitude !== 'number') return;
        const isNearest = Boolean(userLocation) && !highlightedNearest;
        if (isNearest) highlightedNearest = true;
        const marker = L.marker([h.latitude, h.longitude], {
          icon: pinIcon(L, isNearest ? COLOR_HIGHLIGHT : COLOR_AMETHYST, isNearest ? 42 : 36),
          title: h.name,
          zIndexOffset: isNearest ? 1000 : 0,
        });
        marker.bindPopup(
          `<strong>${escapeHtml(h.name)}</strong><br/>${escapeHtml(h.address ?? '')}`,
        );
        if (onSelectHospital) marker.on('click', () => onSelectHospital(h.id));
        marker.addTo(layer);
      });
    })();
  }, [hospitals, userLocation, onSelectHospital, ready]);

  // Draw/replace the route polyline.
  useEffect(() => {
    (async () => {
      const L = (await import('leaflet')).default;
      const layer = routeLayerRef.current;
      if (!layer) return;
      layer.clearLayers();
      if (routeGeometry && routeGeometry.length > 1) {
        // Wide translucent glow beneath a solid line → a "liquid" highlighted route.
        L.polyline(routeGeometry, {
          color: COLOR_HIGHLIGHT,
          weight: 11,
          opacity: 0.25,
          lineCap: 'round',
          lineJoin: 'round',
        }).addTo(layer);
        L.polyline(routeGeometry, {
          color: COLOR_HIGHLIGHT,
          weight: 4,
          opacity: 0.95,
          lineCap: 'round',
          lineJoin: 'round',
        }).addTo(layer);
      }
    })();
  }, [routeGeometry, ready]);

  return (
    <div ref={containerRef} data-testid="leaflet-map" style={{ width: '100%', height: '100%' }} />
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
