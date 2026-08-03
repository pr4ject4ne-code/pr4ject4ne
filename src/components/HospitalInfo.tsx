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
      {/* The hospital name is this page's ONLY <h1> (it used to be an <h2>, so
          the profile shipped with no h1 at all — a real hierarchy AND a11y
          defect). The one other <h1> on this route lives in
          HospitalProfileClient's error branch, which early-returns before
          this tree is ever constructed, so the two can never co-render.
          The verified/community badge sits BESIDE the heading rather than
          inside it, so the h1's accessible name is exactly the hospital
          name and nothing else. */}
      <div className={styles.nameRow}>
        <h1 className={styles.name}>{hospital.name}</h1>
        {hospital.verified ? (
          <span className={styles.verified}>Verified</span>
        ) : (
          <span className={styles.community}>Community-managed</span>
        )}
      </div>
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
