'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import Layout from '@/components/Layout';
import HospitalMiniProfile from '@/components/HospitalMiniProfile';
import Button from '@/components/Button';
import { getCurrentPosition, DEFAULT_CENTER, type Coords } from '@/lib/geolocation';
import { fetchRoute, distanceKm } from '@/lib/map';
import type { Hospital } from '@/types';
import styles from './HomeClient.module.css';

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

  // Load hospitals on query change.
  useEffect(() => {
    setOffset(0);
    loadHospitals(0, false);
  }, [loadHospitals]);

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
      <div className={styles.mapWrap}>
        <Map
          center={center}
          userLocation={userLocation}
          hospitals={orderedHospitals}
          routeGeometry={route}
        />
      </div>

      <section className={styles.results} aria-label="Hospital results">
        {geoError && (
          <p className={styles.notice} role="status">
            {geoError}
          </p>
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
    </Layout>
  );
}
