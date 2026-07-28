'use client';

import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import type { Map as MLMap, Marker as MLMarker, StyleSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { DEFAULT_CENTER, type Coords } from '@/lib/geolocation';

/**
 * Single-pin location picker (worklist #35) — reuses Map.tsx's MapLibre GL +
 * MapTiler setup pattern (same style resolution, same CSP-allowlisted host,
 * see src/middleware.ts) but deliberately does NOT pull in Map.tsx's routing/
 * clustering/multi-pin features: this component only ever shows one marker.
 *
 * Controlled component (matches this app's Input/Dropdown pattern): the
 * parent owns `lat`/`lng` and receives updates via `onChange`. Clicking
 * anywhere on the map, or dragging the marker, both call `onChange` with the
 * new coordinates — the parent is responsible for keeping any sibling manual
 * lat/lng number inputs in sync (and, in the other direction, passing updated
 * `lat`/`lng` props back down moves the pin to match).
 */

const MAPTILER_KEY = process.env.NEXT_PUBLIC_MAPTILER_KEY;
const MAP_STYLE = process.env.NEXT_PUBLIC_MAP_STYLE ?? 'streets-v2';

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

interface LocationPickerProps {
  /** Current pin position. `null`/`undefined` falls back to DEFAULT_CENTER
   * (Enugu) — a sensible starting point when a hospital has no coordinates
   * yet. */
  lat?: number | null;
  lng?: number | null;
  onChange: (coords: Coords) => void;
  /** CSS height of the map container. Defaults to a compact form-embed size. */
  height?: number | string;
}

export default function LocationPicker({ lat, lng, onChange, height = 280 }: LocationPickerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const markerRef = useRef<MLMarker | null>(null);
  // Keep onChange current for the click/dragend handlers without re-running
  // the init effect (which must only run once).
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const hasCoords = typeof lat === 'number' && typeof lng === 'number';
  const initialCenter: Coords = hasCoords ? { lat: lat as number, lng: lng as number } : DEFAULT_CENTER;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: resolveStyle(),
      center: [initialCenter.lng, initialCenter.lat],
      zoom: 12,
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
    mapRef.current = map;

    const marker = new maplibregl.Marker({ draggable: true, color: '#7b5aa6' })
      .setLngLat([initialCenter.lng, initialCenter.lat])
      .addTo(map);
    marker.on('dragend', () => {
      const pos = marker.getLngLat();
      onChangeRef.current({ lat: pos.lat, lng: pos.lng });
    });
    markerRef.current = marker;

    map.on('click', (e: maplibregl.MapMouseEvent) => {
      marker.setLngLat(e.lngLat);
      onChangeRef.current({ lat: e.lngLat.lat, lng: e.lngLat.lng });
    });

    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // Deliberately init-once: subsequent lat/lng prop changes are handled by
    // the sync effect below, not by re-creating the map.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the pin in sync when the parent updates lat/lng from elsewhere (e.g.
  // the sibling manual number inputs) — the "either direction updates the
  // other" requirement.
  useEffect(() => {
    const marker = markerRef.current;
    const map = mapRef.current;
    if (!marker || !map || !hasCoords) return;
    const current = marker.getLngLat();
    if (Math.abs(current.lat - (lat as number)) < 1e-9 && Math.abs(current.lng - (lng as number)) < 1e-9) {
      return;
    }
    marker.setLngLat([lng as number, lat as number]);
    map.easeTo({ center: [lng as number, lat as number], duration: 300 });
  }, [lat, lng, hasCoords]);

  return (
    <div
      ref={containerRef}
      data-testid="location-picker-map"
      style={{ width: '100%', height, borderRadius: 'var(--radius)', overflow: 'hidden' }}
    />
  );
}
