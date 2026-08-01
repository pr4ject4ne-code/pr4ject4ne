'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import Layout from '@/components/Layout';
import SearchBar from '@/components/SearchBar';
import HospitalMiniProfile from '@/components/HospitalMiniProfile';
import Button from '@/components/Button';
import HospitalFilters, {
  DEFAULT_HOME_FILTERS,
  type HomeFilterValue,
} from '@/components/HospitalFilters';
import { getCurrentPosition, DEFAULT_CENTER, type Coords } from '@/lib/geolocation';
import { fetchRoute, distanceKm, geocode } from '@/lib/map';
import { buildHospitalsQuery } from '@/lib/filter-search';
import { specialtyLabelsForSymptomIds } from '@/lib/symptom-specialty-map';
import type { Hospital } from '@/types';
import styles from './HomeClient.module.css';

// Map is client-only (MapLibre touches window); load without SSR.
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
  const [manualQuery, setManualQuery] = useState('');
  const [locating, setLocating] = useState(false);
  const [manualError, setManualError] = useState<string | null>(null);
  const [filters, setFilters] = useState<HomeFilterValue>(DEFAULT_HOME_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [mapExpanded, setMapExpanded] = useState(false);

  const nameQuery = searchParams.get('q') ?? '';
  // Stage 1 emergency gate result (symptom-red-flags.ts), decided client-side
  // in SearchBar.tsx before navigation — when set, Stage 2 specialty routing
  // is skipped ENTIRELY (no symptom param is ever sent alongside `emergency=1`,
  // but this is also defensively ignored below even if both were present).
  const isEmergency = searchParams.get('emergency') === '1';
  const symptomQuery = searchParams.get('symptom') ?? '';
  // Whitelisted symptom ids (the homepage's own non-emergency, region-based
  // vocabulary — see symptom-specialty-map.ts), comma-separated in the URL
  // (see SearchBar.tsx's multi-select). Never applied during an emergency
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
        // it and let the user retry (see the retry button in the results section).
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

  // Ask for geolocation when the user requests "nearest" — shows the
  // geoError banner (with its manual-location fallback) on failure, since an
  // explicit "Nearest" search is actively blocked without it.
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

  // Also ask proactively on every homepage visit, even without an explicit
  // "Nearest" search (founder ask, 2026-07-29: "show current location with a
  // blue pin"). Deliberately silent on failure (denied/unsupported/timeout)
  // — this is ambient, so a failure just means no blue dot appears, not a
  // banner nagging the user. Skipped when `wantNearest` is already true at
  // mount (e.g. a direct `?nearest=1` link) so the browser's permission
  // prompt doesn't fire twice for the same request.
  useEffect(() => {
    if (wantNearest) return;
    getCurrentPosition()
      .then((coords) => {
        setUserLocation(coords);
        setCenter(coords);
      })
      .catch(() => {
        // Ambient — no error UI.
      });
    // Deliberately mount-only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // Sort by proximity when we have the user's location — EXCEPT for a symptom
  // search, where the server already ranks results by specialty-match
  // strength first (then distance, then rating; see hospital-filters.ts).
  // Re-sorting by raw distance here would silently discard that ranking.
  // Also attaches `distanceKm` onto each hospital (when a location is known)
  // so downstream result-card UI can show it without recomputing distance.
  const orderedHospitals = useMemo(() => {
    if (!userLocation) return hospitals;
    const withDistance = hospitals.map((h) => {
      const km =
        typeof h.latitude === 'number' && typeof h.longitude === 'number'
          ? distanceKm(userLocation, { lat: h.latitude, lng: h.longitude })
          : undefined;
      return km === undefined ? h : { ...h, distanceKm: km };
    });
    if (symptomTags.length > 0) return withDistance;
    return [...withDistance].sort((a, b) => {
      const da = a.distanceKm ?? Infinity;
      const db = b.distanceKm ?? Infinity;
      return da - db;
    });
  }, [hospitals, userLocation, symptomTags]);

  // Route to a target hospital when we have a user location, drawn as a line
  // on the map (see Map.tsx's routeGeometry). Defaults to the nearest result;
  // tapping a different pin on the map (see `onSelectMapPin` below) overrides
  // the target so the route actually updates to show directions to THAT
  // hospital instead of staying stuck on whichever one was nearest.
  //
  // Note: this used to also compute a per-hospital ETA number (shown on cards
  // and pin popups), removed 2026-08-01 — the founder decided to drop the ETA
  // display, but the route line itself is a separate, kept feature.
  const [routeTargetId, setRouteTargetId] = useState<string | null>(null);
  useEffect(() => {
    if (!userLocation) return;
    const target =
      (routeTargetId ? orderedHospitals.find((h) => h.id === routeTargetId) : null) ??
      orderedHospitals.find((h) => typeof h.latitude === 'number' && typeof h.longitude === 'number');
    if (!target || target.latitude == null || target.longitude == null) return;
    fetchRoute(userLocation, { lat: target.latitude, lng: target.longitude }).then((r) => {
      if (r) setRoute(r.geometry);
    });
  }, [userLocation, orderedHospitals, routeTargetId]);

  // Tapping a hospital's pin on the map (re)requests directions to that
  // specific hospital, rather than leaving the route pinned to whichever one
  // was nearest at the time of the last search.
  const onSelectMapPin = useCallback((id: string) => {
    setRouteTargetId(id);
  }, []);

  const canLoadMore = hospitals.length < total;

  return (
    <Layout page="homepage">
      <section className={styles.hero}>
        <div className={styles.heroInner}>
          <h1 className={styles.heroTitle}>
            Find care near you, <span className={styles.heroAccent}>not just a listing.</span>
          </h1>
          <p className={styles.heroSub}>
            Search hospitals by distance, name, or symptoms, and see real patient ratings by
            department, not one flat score.
          </p>
          <div className={styles.searchGlass}>
            <SearchBar />
          </div>
          {!loading && total > 0 && (
            <p className={styles.trust}>
              {total} hospital{total === 1 ? '' : 's'} in the directory
            </p>
          )}
        </div>
      </section>

      <section className={styles.mapSection}>
        <div className={styles.mapHead}>
          <div className={styles.mapHeadText}>
            <h2>The map</h2>
            <p>See hospitals plotted near you, expand for a closer look.</p>
          </div>
          <button
            type="button"
            className={styles.mapExpandBtn}
            aria-expanded={mapExpanded}
            aria-controls="homepage-map-panel"
            onClick={() => setMapExpanded((prev) => !prev)}
          >
            {mapExpanded ? 'Collapse map' : 'Expand map'}
            <svg
              className={mapExpanded ? styles.mapExpandIconOn : styles.mapExpandIcon}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>
        </div>
        <div
          id="homepage-map-panel"
          className={mapExpanded ? `${styles.mapPanel} ${styles.mapPanelExpanded}` : styles.mapPanel}
        >
          <Map
            center={center}
            userLocation={userLocation}
            hospitals={orderedHospitals}
            routeGeometry={route}
            onSelectHospital={onSelectMapPin}
            selectedHospitalId={routeTargetId}
          />
        </div>
      </section>

      <section className={styles.results}>
        {isEmergency && (
          <div className={styles.emergencyBanner} role="alert">
            <p className={styles.emergencyBannerText}>
              This may be an emergency, go to the nearest hospital or emergency department now,
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
            <HospitalMiniProfile key={h.id} hospital={h} />
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
    </Layout>
  );
}
