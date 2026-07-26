'use client';

import Link from 'next/link';
import Card from './Card';
import Stars from './Stars';
import { formatEta } from '@/lib/map';
import { prefersReducedMotion } from '@/lib/reducedMotion';
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
    <Card
      as="article"
      className={styles.card}
      onPointerMove={(e) => {
        // Pointer-tracked specular light: the highlight follows the cursor
        // across the glass, continuously (every event), not just on
        // enter/leave. Skipped under prefers-reduced-motion — this is a
        // continuous transform tied to pointer movement, exactly the class
        // of effect that preference asks apps to avoid.
        if (prefersReducedMotion()) return;
        const r = e.currentTarget.getBoundingClientRect();
        e.currentTarget.style.setProperty('--mx', `${((e.clientX - r.left) / r.width) * 100}%`);
        e.currentTarget.style.setProperty('--my', `${((e.clientY - r.top) / r.height) * 100}%`);
      }}
    >
      <span className={styles.sheen} aria-hidden="true" />
      <Link href={`/hospitals/${hospital.id}`} className={styles.link}>
        <div className={styles.thumb}>
          {photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photo} alt="" />
          ) : (
            <svg
              className={styles.placeholder}
              viewBox="0 0 24 24"
              width="34"
              height="34"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <rect x="4" y="6" width="16" height="14" rx="2" />
              <path d="M12 10v6M9 13h6" />
            </svg>
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
