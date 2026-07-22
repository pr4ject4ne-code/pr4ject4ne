import Card from './Card';
import Stars from './Stars';
import type { HospitalRanking } from '@/lib/hospital-ranking';
import styles from './HospitalRankingPanel.module.css';

interface HospitalRankingPanelProps {
  city: string | null;
  ranking: HospitalRanking | null;
}

/**
 * Top-right ratings/ranking panel on the hospital profile (worklist #2):
 * star average, review count, and rank within the hospital's city (region)
 * and nationally. "World" tier intentionally dropped for v1 (single-country app).
 */
export default function HospitalRankingPanel({ city, ranking }: HospitalRankingPanelProps) {
  if (!ranking) {
    // Ranking endpoint hasn't resolved yet (or failed) — still loading, render nothing
    // rather than a misleading placeholder; the parent shows the base hospital object
    // elsewhere in the meantime.
    return null;
  }

  const hasReviews = ranking.rating_count > 0;

  return (
    <Card as="section" className={styles.panel}>
      <h2 className={styles.title}>Rating</h2>
      {hasReviews ? (
        <>
          <Stars value={ranking.rating_avg} count={ranking.rating_count} />
          <dl className={styles.ranks}>
            {ranking.region && (
              <div className={styles.rankRow}>
                <dt>{city ? `In ${city}` : 'In your area'}</dt>
                <dd>
                  #{ranking.region.rank} of {ranking.region.total}
                </dd>
              </div>
            )}
            {ranking.national && (
              <div className={styles.rankRow}>
                <dt>Nationally</dt>
                <dd>
                  #{ranking.national.rank} of {ranking.national.total}
                </dd>
              </div>
            )}
          </dl>
        </>
      ) : (
        <p className={styles.unrated}>Not yet rated</p>
      )}
    </Card>
  );
}
