import Card from './Card';
import { safeHttpUrl } from '@/lib/sanitize';
import type { Hospital } from '@/types';
import styles from './HospitalInfo.module.css';

export default function HospitalInfo({ hospital }: { hospital: Hospital }) {
  // Defense in depth: even though URLs are scheme-validated on write, guard the
  // href sink at render so a stale bad value can never produce a javascript: link.
  const website = safeHttpUrl(hospital.website);
  return (
    <Card variant="plain" as="section">
      <h2 className={styles.name}>
        {hospital.name}
        {hospital.verified && <span className={styles.verified}>Verified</span>}
        {!hospital.verified && <span className={styles.community}>Community-managed</span>}
      </h2>
      <dl className={styles.list}>
        {hospital.address && (
          <div className={styles.row}>
            <dt>Address</dt>
            <dd>
              <a
                href={`https://www.openstreetmap.org/search?query=${encodeURIComponent(hospital.address)}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                {hospital.address}
              </a>
            </dd>
          </div>
        )}
        {website && (
          <div className={styles.row}>
            <dt>Website</dt>
            <dd>
              <a href={website} target="_blank" rel="noopener noreferrer">
                {website}
              </a>
            </dd>
          </div>
        )}
        {hospital.contact_phone && (
          <div className={styles.row}>
            <dt>Phone</dt>
            <dd>
              <a href={`tel:${hospital.contact_phone}`}>{hospital.contact_phone}</a>
            </dd>
          </div>
        )}
        {hospital.contact_email && (
          <div className={styles.row}>
            <dt>Email</dt>
            <dd>
              <a href={`mailto:${hospital.contact_email}`}>{hospital.contact_email}</a>
            </dd>
          </div>
        )}
      </dl>
    </Card>
  );
}
