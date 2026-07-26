'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import Layout from '@/components/Layout';
import HospitalMiniProfile from '@/components/HospitalMiniProfile';
import Button from '@/components/Button';
import HospitalFilters, {
  DEFAULT_HOME_FILTERS,
  type HomeFilterValue,
} from '@/components/HospitalFilters';
import { getCurrentPosition, DEFAULT_CENTER, type Coords } from '@/lib/geolocation';
import { fetchRoute, distanceKm, geocode } from '@/lib/map';
import { clampSheetHeightPx, resolveSheetSnap } from '@/lib/sheetDrag';
import { buildHospitalsQuery } from '@/lib/filter-search';
import { specialtyLabelsForSymptomIds } from '@/lib/symptom-specialty-map';
import { prefersReducedMotion } from '@/lib/reducedMotion';
import type { Hospital } from '@/types';
import styles from './HomeClient.module.css';

// A drag ending faster than FLICK velocity snaps in the direction of travel
// (see sheetDrag.ts) — this caps how far the map's counter-parallax offset
// can travel regardless of how far/fast the sheet itself is dragged, since
// the point is a SUBTLE depth cue, not a second thing visibly moving.
const MAP_PARALLAX_MAX_PX = 6;
const MAP_PARALLAX_FACTOR = 0.03;

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
  const mapLayerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    pointerId: number;
    startY: number;
    startHeightPx: number;
    // Velocity tracking (worklist #1 item 2 — velocity-aware release, not
    // just position-aware). `lastY`/`lastT` are the previous pointermove
    // sample; `velocityPxPerMs` is an exponentially-smoothed rate of HEIGHT
    // change (not raw pointer speed) so it directly matches what
    // resolveSheetSnap compares against. Smoothing (not just the final
    // instantaneous sample) avoids a single jittery low-dt sample producing
    // a spurious "flick" reading right at release.
    lastY: number;
    lastT: number;
    velocityPxPerMs: number;
  } | null>(null);
  const [sheetExpanded, setSheetExpanded] = useState(false);
  const [isDraggingSheet, setIsDraggingSheet] = useState(false);
  const [filters, setFilters] = useState<HomeFilterValue>(DEFAULT_HOME_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const nameQuery = searchParams.get('q') ?? '';
  // Stage 1 emergency gate result (symptom-red-flags.ts), decided client-side
  // in Header.tsx before navigation — when set, Stage 2 specialty routing is
  // skipped ENTIRELY (no symptom param is ever sent alongside `emergency=1`,
  // but this is also defensively ignored below even if both were present).
  const isEmergency = searchParams.get('emergency') === '1';
  const symptomQuery = searchParams.get('symptom') ?? '';
  // Whitelisted symptom ids (the homepage's own non-emergency, region-based
  // vocabulary — see symptom-specialty-map.ts), comma-separated in the URL
  // (see Header.tsx's multi-select). Never applied during an emergency
  // outcome — Stage 1 always wins.
  const symptomTags = useMemo(
    () =>
      isEmergency
        ? []
        : symptomQuery.split(',').map((s) => s.trim()).filter(Boolean),
    [symptomQuery, isEmergency],
  );
  const wantNearest = searchParams.get('nearest') === '1' || isEmergency;

  const loadHospitals = useCallback(
    async (nextOffset: number, append: boolean) => {
      setLoading(true);
      setLoadError(null);
      const qs = buildHospitalsQuery({
        q: nameQuery || undefined,
        symptoms: symptomTags.length > 0 ? symptomTags : undefined,
        minRating: filters.minRating || undefined,
        ownership: filters.ownership || undefined,
        openDay: filters.openDay || undefined,
        radiusKm: filters.radiusKm ? Number(filters.radiusKm) : undefined,
        lat: userLocation?.lat,
        lng: userLocation?.lng,
        limit: PAGE_SIZE,
        offset: nextOffset,
      });
      try {
        const res = await fetch(`/api/hospitals?${qs}`);
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
    [nameQuery, symptomTags, filters, userLocation],
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
      // A continuous scroll-linked transform is exactly the kind of motion
      // prefers-reduced-motion asks apps to avoid — skip the per-scroll
      // write entirely rather than just relying on the CSS transition-speed
      // override, so the value doesn't visibly ratchet on every scroll tick.
      if (prefersReducedMotion()) return;
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
    // Ignore a second pointer landing on the grabber while one is already
    // driving the drag — otherwise it would overwrite dragRef with a pointer
    // id whose eventual release never matches, orphaning the first pointer's
    // drag state (isDraggingSheet stuck true, .dragging transition-suppress
    // stuck applied).
    if (dragRef.current) return;
    const panel = panelRef.current;
    if (!panel) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const now = performance.now();
    dragRef.current = {
      pointerId: e.pointerId,
      startY: e.clientY,
      startHeightPx: panel.getBoundingClientRect().height,
      lastY: e.clientY,
      lastT: now,
      velocityPxPerMs: 0,
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

    // Velocity: rate of HEIGHT change (not raw pointer delta) between this
    // sample and the last one, exponentially smoothed so the final reading
    // reflects the recent trend of the gesture rather than one noisy sample.
    const now = performance.now();
    const dt = now - drag.lastT;
    if (dt > 0) {
      const deltaHeightPx = drag.lastY - e.clientY; // matches deltaUp's sign convention
      const instantVelocity = deltaHeightPx / dt;
      drag.velocityPxPerMs = drag.velocityPxPerMs * 0.5 + instantVelocity * 0.5;
    }
    drag.lastY = e.clientY;
    drag.lastT = now;

    // One clear parallax/depth proof-point (worklist #1 item 4): nudge the
    // map layer a few px opposite the sheet's own motion while dragging, so
    // the panel and the layer behind it move at genuinely different rates —
    // a few px of differential motion is what makes the blur between them
    // read as a pane with real thickness rather than a flat texture. Skipped
    // entirely under prefers-reduced-motion (a continuous transform tied to
    // pointer movement, not a static end-state).
    if (!prefersReducedMotion()) {
      const parallaxPx = Math.max(
        -MAP_PARALLAX_MAX_PX,
        Math.min(MAP_PARALLAX_MAX_PX, -deltaUp * MAP_PARALLAX_FACTOR),
      );
      mapLayerRef.current?.style.setProperty('--map-parallax', `${parallaxPx}px`);
    }
  }, []);

  const endGrabberDrag = useCallback((e: React.PointerEvent<HTMLSpanElement>) => {
    const drag = dragRef.current;
    const panel = panelRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    dragRef.current = null;
    setIsDraggingSheet(false);
    mapLayerRef.current?.style.setProperty('--map-parallax', '0px');
    if (!panel) return;
    const currentHeightPx = panel.getBoundingClientRect().height;
    panel.style.height = ''; // hand back to the CSS class + transition for the snap animation
    setSheetExpanded(
      resolveSheetSnap(currentHeightPx, window.innerHeight, undefined, undefined, drag.velocityPxPerMs),
    );
  }, []);

  const onGrabberKeyDown = useCallback((e: React.KeyboardEvent<HTMLSpanElement>) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    setSheetExpanded((prev) => !prev);
  }, []);

  // Sort by proximity when we have the user's location — EXCEPT for a symptom
  // search, where the server already ranks results by specialty-match
  // strength first (then distance, then rating; see hospital-filters.ts).
  // Re-sorting by raw distance here would silently discard that ranking.
  const orderedHospitals = useMemo(() => {
    if (!userLocation || symptomTags.length > 0) return hospitals;
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
  }, [hospitals, userLocation, symptomTags]);

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
        <div
          ref={mapLayerRef}
          className={[styles.mapLayer, isDraggingSheet && styles.parallaxDragging]
            .filter(Boolean)
            .join(' ')}
        >
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
        {isEmergency && (
          <div className={styles.emergencyBanner} role="alert">
            <p className={styles.emergencyBannerText}>
              This may be an emergency — go to the nearest hospital or emergency department now,
              or call 112.
            </p>
            <a className={styles.emergencyCallBtn} href="tel:112">
              Call 112
            </a>
          </div>
        )}
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
        {!isEmergency && symptomTags.length > 0 && (
          <p className={styles.notice}>
            People with symptoms like this usually see:{' '}
            {specialtyLabelsForSymptomIds(symptomTags).join(', ')}. This is based on which
            services hospitals list, not an assessment of your condition. If you think this is an
            emergency, call 112 or go to the nearest hospital now.
          </p>
        )}
        <div className={styles.headingRow}>
          <h2 className={styles.heading}>
            {nameQuery ? `Results for “${nameQuery}”` : 'Hospitals'}{' '}
            <span className={styles.count}>({total})</span>
          </h2>
          <button
            type="button"
            className={styles.filterToggle}
            aria-expanded={filtersOpen}
            onClick={() => setFiltersOpen((prev) => !prev)}
          >
            {filtersOpen ? 'Hide filters' : 'Filters'}
          </button>
        </div>
        {filtersOpen && (
          <HospitalFilters
            value={filters}
            onChange={setFilters}
            hasLocation={userLocation != null}
          />
        )}
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
