'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import Layout from '@/components/Layout';
import HospitalMiniProfile from '@/components/HospitalMiniProfile';
import Button from '@/components/Button';
import { getCurrentPosition, DEFAULT_CENTER, type Coords } from '@/lib/geolocation';
import { fetchRoute, distanceKm, geocode } from '@/lib/map';
import { clampSheetHeightPx, resolveSheetSnap } from '@/lib/sheetDrag';
import type { Hospital } from '@/types';
import styles from './HomeClient.module.css';

// Below this width the results panel is a docked side panel (see
// HomeClient.module.css), not a draggable bottom sheet — matches the
// existing `@media (min-width: 900px)` breakpoint there.
const MOBILE_SHEET_BREAKPOINT = 900;

// Map is client-only (Leaflet touches window); load without SSR.
const Map = dynamic(() => import('@/components/Map'), { ssr: false });

const PAGE_SIZE = 10;

export default function HomeClient() {
  const searchParams = useSearchParams();
  const [center, setCenter] = useState<Coords>(DEFAULT_CENTER);
  const [userLocation, setUserLocation] = useState<Coords | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [route, setRoute] = useState<Array<[number, number]> | null>(null);
  const [etas, setEtas] = useState<Record<string, number>>({});
  const [manualQuery, setManualQuery] = useState('');
  const [locating, setLocating] = useState(false);
  const [manualError, setManualError] = useState<string | null>(null);
  const darkenRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const dragRef = useRef<{ pointerId: number; startY: number; startHeightPx: number } | null>(
    null,
  );
  const [sheetExpanded, setSheetExpanded] = useState(false);
  const [isDraggingSheet, setIsDraggingSheet] = useState(false);

  const nameQuery = searchParams.get('q') ?? '';
  const symptomQuery = searchParams.get('symptom') ?? '';
  const wantNearest = searchParams.get('nearest') === '1';

  const loadHospitals = useCallback(
    async (nextOffset: number, append: boolean) => {
      setLoading(true);
      setLoadError(null);
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(nextOffset),
      });
      if (nameQuery) params.set('q', nameQuery);
      try {
        const res = await fetch(`/api/hospitals?${params.toString()}`);
        if (!res.ok) throw new Error(`Request failed (${res.status})`);
        const data = await res.json();
        const list: Hospital[] = data.hospitals ?? [];
        setTotal(data.total ?? 0);
        setHospitals((prev) => (append ? [...prev, ...list] : list));
      } catch {
        // A failed load must not leave the page silently empty forever — surface
        // it and let the user retry (see the retry button in the results panel).
        setLoadError('Could not load hospitals. Please try again.');
        if (!append) {
          setHospitals([]);
          setTotal(0);
        }
      } finally {
        setLoading(false);
      }
    },
    [nameQuery],
  );

  // Ask for geolocation when the user requests "nearest".
  useEffect(() => {
    if (!wantNearest) return;
    getCurrentPosition()
      .then((coords) => {
        setUserLocation(coords);
        setCenter(coords);
        setGeoError(null);
      })
      .catch((err: Error) => setGeoError(err.message));
  }, [wantNearest]);

  // Manual-location fallback: when geolocation is denied/unavailable, let the
  // user type an area/landmark and geocode it so "nearest" + routing still work.
  const onManualLocate = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const q = manualQuery.trim();
      if (!q) return;
      setLocating(true);
      setManualError(null);
      const coords = await geocode(q, DEFAULT_CENTER);
      setLocating(false);
      if (coords) {
        setUserLocation(coords);
        setCenter(coords);
        setGeoError(null);
      } else {
        setManualError('Could not find that place. Try a nearby area or landmark.');
      }
    },
    [manualQuery],
  );

  // Load hospitals on query change.
  useEffect(() => {
    setOffset(0);
    loadHospitals(0, false);
  }, [loadHospitals]);

  // Progressively darken the fixed map backdrop as the page scrolls, so it
  // reads as "receding into the background" rather than scrolling away.
  // Imperative DOM writes (not React state) keep this off the render path.
  useEffect(() => {
    const MAX_DARKEN = 0.55;
    let ticking = false;
    const applyDarken = () => {
      ticking = false;
      const distance = window.innerHeight || 1;
      const progress = Math.min(1, Math.max(0, window.scrollY / distance));
      darkenRef.current?.style.setProperty('--map-darken', String(progress * MAX_DARKEN));
    };
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(applyDarken);
    };
    applyDarken();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Mobile bottom-sheet drag-to-resize. The grabber previously did nothing —
  // the sheet was stuck at its collapsed max-height with no way to see more
  // results without the panel's own internal scroll. Pointer Events (not
  // legacy touch events) give consistent mouse+touch+pen support in one
  // handler set. Height is written imperatively to the DOM while dragging
  // (same pattern as the scroll-darken effect above) so every pointermove
  // doesn't trigger a React re-render; only the settled snap state
  // (`sheetExpanded`) is React state, since that's what drives the CSS
  // transition + aria-expanded on release.
  const onGrabberPointerDown = useCallback((e: React.PointerEvent<HTMLSpanElement>) => {
    if (window.innerWidth >= MOBILE_SHEET_BREAKPOINT) return;
    const panel = panelRef.current;
    if (!panel) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      pointerId: e.pointerId,
      startY: e.clientY,
      startHeightPx: panel.getBoundingClientRect().height,
    };
    setIsDraggingSheet(true);
  }, []);

  const onGrabberPointerMove = useCallback((e: React.PointerEvent<HTMLSpanElement>) => {
    const drag = dragRef.current;
    const panel = panelRef.current;
    if (!drag || !panel || drag.pointerId !== e.pointerId) return;
    const deltaUp = drag.startY - e.clientY;
    const nextHeightPx = clampSheetHeightPx(drag.startHeightPx + deltaUp, window.innerHeight);
    panel.style.height = `${nextHeightPx}px`;
  }, []);

  const endGrabberDrag = useCallback((e: React.PointerEvent<HTMLSpanElement>) => {
    const drag = dragRef.current;
    const panel = panelRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    dragRef.current = null;
    setIsDraggingSheet(false);
    if (!panel) return;
    const currentHeightPx = panel.getBoundingClientRect().height;
    panel.style.height = ''; // hand back to the CSS class + transition for the snap animation
    setSheetExpanded(resolveSheetSnap(currentHeightPx, window.innerHeight));
  }, []);

  const onGrabberKeyDown = useCallback((e: React.KeyboardEvent<HTMLSpanElement>) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    setSheetExpanded((prev) => !prev);
  }, []);

  // Sort by proximity when we have the user's location.
  const orderedHospitals = useMemo(() => {
    if (!userLocation) return hospitals;
    return [...hospitals].sort((a, b) => {
      const da =
        typeof a.latitude === 'number' && typeof a.longitude === 'number'
          ? distanceKm(userLocation, { lat: a.latitude, lng: a.longitude })
          : Infinity;
      const db =
        typeof b.latitude === 'number' && typeof b.longitude === 'number'
          ? distanceKm(userLocation, { lat: b.latitude, lng: b.longitude })
          : Infinity;
      return da - db;
    });
  }, [hospitals, userLocation]);

  // Route + ETA to the nearest hospital when we have a user location.
  useEffect(() => {
    if (!userLocation) return;
    const nearest = orderedHospitals.find(
      (h) => typeof h.latitude === 'number' && typeof h.longitude === 'number',
    );
    if (!nearest || nearest.latitude == null || nearest.longitude == null) return;
    fetchRoute(userLocation, { lat: nearest.latitude, lng: nearest.longitude }).then((r) => {
      if (r) {
        setRoute(r.geometry);
        setEtas((prev) => ({ ...prev, [nearest.id]: r.durationSec }));
      }
    });
  }, [userLocation, orderedHospitals]);

  const canLoadMore = hospitals.length < total;

  return (
    <Layout fullBleed page="homepage">
      <div className={styles.stage}>
        <div className={styles.mapLayer}>
          <Map
            center={center}
            userLocation={userLocation}
            hospitals={orderedHospitals}
            routeGeometry={route}
          />
        </div>
        <div ref={darkenRef} className={styles.darkenOverlay} aria-hidden="true" />

        <section
          ref={panelRef}
          className={[
            styles.panel,
            sheetExpanded && styles.expanded,
            isDraggingSheet && styles.dragging,
          ]
            .filter(Boolean)
            .join(' ')}
          aria-label="Hospital results"
        >
          <span
            className={styles.grabber}
            role="button"
            tabIndex={0}
            aria-expanded={sheetExpanded}
            aria-label={sheetExpanded ? 'Collapse results' : 'Expand results'}
            onPointerDown={onGrabberPointerDown}
            onPointerMove={onGrabberPointerMove}
            onPointerUp={endGrabberDrag}
            onPointerCancel={endGrabberDrag}
            onKeyDown={onGrabberKeyDown}
          />
        {geoError && (
          <div className={styles.notice} role="status">
            <p className={styles.noticeText}>{geoError}</p>
            <form className={styles.locateForm} onSubmit={onManualLocate}>
              <input
                className={styles.locateInput}
                type="search"
                value={manualQuery}
                onChange={(e) => setManualQuery(e.target.value)}
                placeholder="e.g. Independence Layout, Enugu"
                aria-label="Enter your location"
              />
              <Button type="submit" variant="secondary" disabled={locating || !manualQuery.trim()}>
                {locating ? 'Locating…' : 'Use location'}
              </Button>
            </form>
            {manualError && <p className={styles.noticeText}>{manualError}</p>}
          </div>
        )}
        {symptomQuery && (
          <p className={styles.notice}>
            Showing hospitals near you for “{symptomQuery}”. Symptom-based routing is guidance only
            — it never diagnoses. For emergencies, call local services immediately.
          </p>
        )}
        <h2 className={styles.heading}>
          {nameQuery ? `Results for “${nameQuery}”` : 'Hospitals'}{' '}
          <span className={styles.count}>({total})</span>
        </h2>
        <div className={styles.list}>
          {orderedHospitals.map((h) => (
            <HospitalMiniProfile key={h.id} hospital={h} etaSec={etas[h.id]} />
          ))}
          {!loading && loadError && orderedHospitals.length === 0 && (
            <div className={styles.empty} role="alert">
              <p>{loadError}</p>
              <Button variant="ghost" onClick={() => loadHospitals(0, false)} disabled={loading}>
                Retry
              </Button>
            </div>
          )}
          {!loading && !loadError && orderedHospitals.length === 0 && (
            <p className={styles.empty}>No hospitals found. Try a different search.</p>
          )}
        </div>
        {canLoadMore && (
          <div className={styles.more}>
            <Button
              variant="ghost"
              disabled={loading}
              onClick={() => {
                const next = offset + PAGE_SIZE;
                setOffset(next);
                loadHospitals(next, true);
              }}
            >
              {loading ? 'Loading…' : 'Load more'}
            </Button>
          </div>
        )}
        </section>
      </div>
    </Layout>
  );
}
