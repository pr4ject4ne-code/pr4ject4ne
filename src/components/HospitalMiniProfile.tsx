'use client';

import Link from 'next/link';
import Card from './Card';
import Stars from './Stars';
import { formatEta } from '@/lib/map';
import type { Hospital } from '@/types';
import styles from './HospitalMiniProfile.module.css';

interface Props {
  hospital: Hospital;
  etaSec?: number | null;
}

/**
 * Collapsed hospital card shown below the map. Clicking navigates to the full
 * hospital profile page (per spec, it does not expand inline).
 */
export default function HospitalMiniProfile({ hospital, etaSec }: Props) {
  const photo = hospital.photos?.[0]?.url;
  return (
    <Card as="article" className={styles.card}>
      <Link href={`/hospitals/${hospital.id}`} className={styles.link}>
        <div className={styles.thumb}>
          {photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photo} alt="" />
          ) : (
            <div className={styles.placeholder} aria-hidden="true">
              🏥
            </div>
          )}
        </div>
        <div className={styles.body}>
          <div className={styles.titleRow}>
            <h3 className={styles.name}>{hospital.name}</h3>
            {hospital.verified && <span className={styles.verified}>Verified</span>}
          </div>
          {hospital.address && <p className={styles.address}>{hospital.address}</p>}
          {hospital.specialties.length > 0 && (
            <p className={styles.specialties}>{hospital.specialties.slice(0, 3).join(' · ')}</p>
          )}
          <div className={styles.meta}>
            {hospital.rating_count > 0 && (
              <Stars value={hospital.rating_avg} count={hospital.rating_count} />
            )}
            {typeof etaSec === 'number' && (
              <span className={styles.eta}>ETA {formatEta(etaSec)}</span>
            )}
            {hospital.is_24_hour && <span className={styles.badge}>24h</span>}
          </div>
        </div>
      </Link>
    </Card>
  );
}
