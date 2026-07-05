'use client';

import { useEffect, useRef } from 'react';
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
    })();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
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
        L.circleMarker([userLocation.lat, userLocation.lng], {
          radius: 8,
          color: '#2b4a7e',
          fillColor: '#2b4a7e',
          fillOpacity: 0.9,
        })
          .bindPopup('You are here')
          .addTo(layer);
      }

      hospitals.forEach((h) => {
        if (typeof h.latitude !== 'number' || typeof h.longitude !== 'number') return;
        const marker = L.circleMarker([h.latitude, h.longitude], {
          radius: 9,
          color: '#6b4c8a',
          fillColor: '#6b4c8a',
          fillOpacity: 0.85,
        });
        marker.bindPopup(
          `<strong>${escapeHtml(h.name)}</strong><br/>${escapeHtml(h.address ?? '')}`,
        );
        if (onSelectHospital) marker.on('click', () => onSelectHospital(h.id));
        marker.addTo(layer);
      });
    })();
  }, [hospitals, userLocation, onSelectHospital]);

  // Draw/replace the route polyline.
  useEffect(() => {
    (async () => {
      const L = (await import('leaflet')).default;
      const layer = routeLayerRef.current;
      if (!layer) return;
      layer.clearLayers();
      if (routeGeometry && routeGeometry.length > 1) {
        L.polyline(routeGeometry, { color: '#2b4a7e', weight: 4, opacity: 0.7 }).addTo(layer);
      }
    })();
  }, [routeGeometry]);

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
