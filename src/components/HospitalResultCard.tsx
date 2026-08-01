'use client';

import Link from 'next/link';
import Card from './Card';
import Stars from './Stars';
import type { Hospital } from '@/types';
import styles from './HospitalResultCard.module.css';

interface Props {
  hospital: Hospital;
  distanceKm?: number | null;
}

/**
 * Result-card for the homepage's hospital grid (Racoon Eye v1 rebuild).
 * Plain (non-glass) card variant per the site-wide rule that glass is
 * reserved for floating chrome — this is page content. Media block carries
 * the photo/placeholder plus overlay badges; body carries name, location,
 * rating, and a capped specialties pill row. The whole card links to the
 * hospital's profile page, mirroring HospitalMiniProfile's navigation.
 */
export default function HospitalResultCard({ hospital, distanceKm }: Props) {
  const photo = hospital.photos?.[0]?.url;
  const specialties = hospital.specialties.slice(0, 3);

  return (
    <Card as="article" variant="plain" className={styles.card}>
      <Link href={`/hospitals/${hospital.id}`} className={styles.link}>
        <div className={styles.media}>
          {photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photo} alt="" className={styles.photo} />
          ) : (
            <div className={styles.placeholderWrap}>
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
            </div>
          )}
          {hospital.verified && <span className={styles.badgeVerified}>Verified</span>}
          {hospital.is_24_hour && <span className={styles.badgeLive}>Open 24h</span>}
          {distanceKm != null && (
            <span className={styles.badgeDist}>{distanceKm.toFixed(1)} km</span>
          )}
        </div>
        <div className={styles.body}>
          <h3 className={styles.name}>{hospital.name}</h3>
          {hospital.address && <p className={styles.address}>{hospital.address}</p>}
          {hospital.rating_count > 0 && (
            <div className={styles.ratingRow}>
              <Stars value={hospital.rating_avg} count={hospital.rating_count} />
            </div>
          )}
          {specialties.length > 0 && (
            <div className={styles.pills}>
              {specialties.map((s) => (
                <span key={s} className={styles.pill}>
                  {s}
                </span>
              ))}
            </div>
          )}
        </div>
      </Link>
    </Card>
  );
}
