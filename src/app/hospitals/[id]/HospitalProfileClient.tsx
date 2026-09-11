'use client';

import { useEffect, useMemo, useState } from 'react';
import Layout from '@/components/Layout';
import HospitalGallery from '@/components/HospitalGallery';
import HospitalInfo from '@/components/HospitalInfo';
import HospitalHours from '@/components/HospitalHours';
import AnnouncementCalendar from '@/components/AnnouncementCalendar';
import DoctorRoster from '@/components/DoctorRoster';
import HospitalDepartments, {
  type DepartmentAggregate,
  type YourDepartmentRating,
  type DepartmentRatingSubmission,
} from '@/components/HospitalDepartments';
import GeneralRating, { type GeneralRatingSummary, type YourGeneralRating } from '@/components/GeneralRating';
import HospitalRankingPanel from '@/components/HospitalRankingPanel';
import Card from '@/components/Card';
import { authFetch } from '@/lib/authFetch';
import { searchWithinHospital, type HospitalSearchMatch } from '@/lib/hospital-search';
import type { HospitalRanking } from '@/lib/hospital-ranking';
import type { Hospital, Doctor, Announcement } from '@/types';
import styles from './HospitalProfile.module.css';

interface Data {
  hospital: Hospital;
  doctors: Doctor[];
  announcements: Announcement[];
  /** Always present from GET /api/hospitals/[id]; defaults to {} defensively
   * if an older/mocked response omits it. */
  department_ratings?: Record<string, DepartmentAggregate>;
  /** Only present when the request carried a valid patient session cookie —
   * absent (not just empty) for a signed-out visitor. */
  your_ratings?: Record<string, YourDepartmentRating>;
  /** Item 8's "general" (per-hospital) rating summary — always present. */
  general_rating?: GeneralRatingSummary;
  /** Same signed-in-only presence rule as your_ratings. */
  your_general_rating?: YourGeneralRating | null;
}

interface RateResponse {
  success: boolean;
  department_avg: number;
  department_count: number;
  hospital_rating_avg: number;
  hospital_rating_count: number;
  your_scores: { staff_score: number; service_score: number; infrastructure_score: number };
}

interface GeneralRateResponse {
  success: boolean;
  general_avg: number;
  general_count: number;
  hospital_rating_avg: number;
  hospital_rating_count: number;
  your_score: number;
}

export default function HospitalProfileClient({ id }: { id: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [ranking, setRanking] = useState<HospitalRanking | null>(null);

  useEffect(() => {
    let active = true;
    fetch(`/api/hospitals/${id}`)
      .then((res) => {
        if (!res.ok) throw new Error('not_found');
        return res.json();
      })
      .then((d: Data) => active && setData(d))
      .catch(() => active && setError('Hospital not found.'));
    return () => {
      active = false;
    };
  }, [id]);

  useEffect(() => {
    // Fetched separately from the base profile — the ranking query is a
    // heavier window-function scan, not something every profile load should
    // pay for by default (see the ranking route's own comment). Best-effort:
    // a failure here just leaves the panel hidden, it never blocks the page.
    let active = true;
    fetch(`/api/hospitals/${id}/ranking`)
      .then((res) => (res.ok ? res.json() : null))
      .then((d: HospitalRanking | null) => active && setRanking(d))
      .catch(() => active && setRanking(null));
    return () => {
      active = false;
    };
  }, [id]);

  const matches: HospitalSearchMatch[] = useMemo(() => {
    if (!data || !searchQuery) return [];
    return searchWithinHospital(searchQuery, data.hospital, data.doctors, data.announcements);
  }, [data, searchQuery]);

  /**
   * POSTs a department rating and patches local state straight from the
   * response body (department_avg/count, hospital_rating_avg/count,
   * your_scores) — no full refetch. Waits for the real response before
   * touching any displayed number (not optimistic-before-confirmation), so a
   * failed submit never flashes a number that didn't actually save. Rejects
   * on any non-2xx so HospitalDepartments' own per-department error/pending
   * UI reflects the failure; a 401 mid-session still gets authFetch's normal
   * redirect-to-login handling on top of that rejection.
   */
  async function handleRate(departmentId: string, submission: DepartmentRatingSubmission) {
    const res = await authFetch(`/api/hospitals/${id}/departments/${departmentId}/ratings`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        staff_score: submission.staffScore,
        service_score: submission.serviceScore,
        infrastructure_score: submission.infrastructureScore,
        review: submission.review,
      }),
    });
    if (!res.ok) throw new Error('rate_failed');
    const body: RateResponse = await res.json();
    setData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        hospital: {
          ...prev.hospital,
          rating_avg: body.hospital_rating_avg,
          rating_count: body.hospital_rating_count,
        },
        department_ratings: {
          ...(prev.department_ratings ?? {}),
          [departmentId]: {
            avg: body.department_avg,
            count: body.department_count,
            staff_avg: body.your_scores.staff_score,
            service_avg: body.your_scores.service_score,
            infrastructure_avg: body.your_scores.infrastructure_score,
          },
        },
        your_ratings: {
          ...(prev.your_ratings ?? {}),
          [departmentId]: {
            staff_score: body.your_scores.staff_score,
            service_score: body.your_scores.service_score,
            infrastructure_score: body.your_scores.infrastructure_score,
            review: submission.review,
          },
        },
      };
    });
  }

  /** Same pattern as handleRate — item 8's general (per-hospital) rating. */
  async function handleGeneralRate(score: number, review: string | null) {
    const res = await authFetch(`/api/hospitals/${id}/general-rating`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ score, review }),
    });
    if (!res.ok) throw new Error('rate_failed');
    const body: GeneralRateResponse = await res.json();
    setData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        hospital: {
          ...prev.hospital,
          rating_avg: body.hospital_rating_avg,
          rating_count: body.hospital_rating_count,
        },
        general_rating: { avg: body.general_avg, count: body.general_count },
        your_general_rating: { score: body.your_score, review },
      };
    });
  }

  if (error) {
    return (
      <Layout page="hospital-profile">
        <div className="page-container">
          <h1>{error}</h1>
        </div>
      </Layout>
    );
  }

  if (!data) {
    return (
      <Layout page="hospital-profile">
        <div className="page-container">
          <p>Loading…</p>
        </div>
      </Layout>
    );
  }

  const { hospital, doctors, announcements } = data;

  return (
    <Layout
      page="hospital-profile"
      hospitalId={hospital.id}
      hospitalName={hospital.name}
      hospitalLogoUrl={hospital.logo_url}
      onHospitalSearch={setSearchQuery}
    >
      <div className={styles.wrap}>
        {searchQuery && (
          <Card as="section" className={styles.searchResults}>
            <h2 className={styles.searchTitle}>
              Results within {hospital.name} for “{searchQuery}”
            </h2>
            {matches.length === 0 ? (
              <p className={styles.muted}>No matches in this hospital&apos;s information.</p>
            ) : (
              <ul className={styles.matchList}>
                {matches.map((m, i) => (
                  <li key={i}>
                    <span className={styles.matchSection}>{m.section}</span>
                    <strong>{m.label}</strong>
                    {m.detail && <span className={styles.matchDetail}>: {m.detail}</span>}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}

        <div className={styles.heroRow}>
          <HospitalGallery photos={hospital.photos} />
          <HospitalRankingPanel city={hospital.city} ranking={ranking} />
        </div>

        <div className={styles.grid}>
          <div className={styles.col}>
            <HospitalInfo hospital={hospital} />
            <GeneralRating
              summary={data.general_rating ?? { avg: 0, count: 0 }}
              yourRating={data.your_general_rating}
              onSubmit={handleGeneralRate}
            />
            <HospitalHours hours={hospital.hours} is24Hour={hospital.is_24_hour} />
            <HospitalDepartments
              departments={hospital.departments}
              ratings={data.department_ratings ?? {}}
              yourRatings={data.your_ratings ?? null}
              onRate={handleRate}
            />
          </div>
          <div className={styles.col}>
            <AnnouncementCalendar announcements={announcements} />
            {hospital.show_doctors && doctors.length > 0 && <DoctorRoster doctors={doctors} />}
          </div>
        </div>
      </div>
    </Layout>
  );
}
