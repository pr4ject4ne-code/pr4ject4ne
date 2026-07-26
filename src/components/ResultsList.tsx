'use client';

import Link from 'next/link';
import Card from './Card';
import Stars from './Stars';
import { safeHttpUrl } from '@/lib/sanitize';
import type { Hospital } from '@/types';
import styles from './ResultsList.module.css';

const TYPE_LABEL: Record<string, string> = {
  hospital: 'Hospital',
  clinic: 'Clinic',
  pharmacy: 'Pharmacy',
  radiology: 'Radiology',
  other: 'Health service',
};

export default function ResultsList({ hospitals }: { hospitals: Hospital[] }) {
  if (hospitals.length === 0) {
    return <p className={styles.empty}>No services match your filters.</p>;
  }
  return (
    <ul className={styles.list}>
      {hospitals.map((h) => {
        const website = safeHttpUrl(h.website);
        return (
        <li key={h.id}>
          <Card variant="plain" as="article" className={styles.card}>
            <div className={styles.head}>
              <h3 className={styles.name}>
                <Link href={`/hospitals/${h.id}`}>{h.name}</Link>
              </h3>
              <span className={styles.type}>{TYPE_LABEL[h.service_type] ?? h.service_type}</span>
            </div>
            {h.address && <p className={styles.address}>{h.address}</p>}
            <div className={styles.meta}>
              {h.contact_phone && <span>{h.contact_phone}</span>}
              {website && (
                <a href={website} target="_blank" rel="noopener noreferrer">
                  Website
                </a>
              )}
              {h.is_24_hour && <span className={styles.badge}>24h</span>}
              {h.rating_count > 0 && <Stars value={h.rating_avg} count={h.rating_count} />}
            </div>
          </Card>
        </li>
        );
      })}
    </ul>
  );
}
