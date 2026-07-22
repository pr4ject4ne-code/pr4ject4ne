'use client';

import { useEffect, useMemo, useState } from 'react';
import Layout from '@/components/Layout';
import HospitalGallery from '@/components/HospitalGallery';
import HospitalInfo from '@/components/HospitalInfo';
import HospitalHours from '@/components/HospitalHours';
import AnnouncementCalendar from '@/components/AnnouncementCalendar';
import DoctorRoster from '@/components/DoctorRoster';
import Card from '@/components/Card';
import { searchWithinHospital, type HospitalSearchMatch } from '@/lib/hospital-search';
import type { Hospital, Doctor, Announcement } from '@/types';
import styles from './HospitalProfile.module.css';

interface Data {
  hospital: Hospital;
  doctors: Doctor[];
  announcements: Announcement[];
}

export default function HospitalProfileClient({ id }: { id: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

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

  const matches: HospitalSearchMatch[] = useMemo(() => {
    if (!data || !searchQuery) return [];
    return searchWithinHospital(searchQuery, data.hospital, data.doctors, data.announcements);
  }, [data, searchQuery]);

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
                    {m.detail && <span className={styles.matchDetail}> — {m.detail}</span>}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}

        <HospitalGallery photos={hospital.photos} />

        <div className={styles.grid}>
          <div className={styles.col}>
            <HospitalInfo hospital={hospital} />
            <HospitalHours hours={hospital.hours} is24Hour={hospital.is_24_hour} />
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
