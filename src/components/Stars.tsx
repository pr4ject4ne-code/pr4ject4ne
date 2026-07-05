import styles from './Stars.module.css';

interface StarsProps {
  value: number;
  count?: number;
}

/** Read-only star rating display (rounded to nearest half is overkill for v1; show avg + count). */
export default function Stars({ value, count }: StarsProps) {
  const full = Math.round(value);
  return (
    <span className={styles.wrap} aria-label={`Rated ${value.toFixed(1)} out of 5`}>
      <span aria-hidden="true" className={styles.stars}>
        {'★★★★★'.slice(0, full)}
        <span className={styles.empty}>{'★★★★★'.slice(full)}</span>
      </span>
      <span className={styles.meta}>
        {value.toFixed(1)}
        {typeof count === 'number' ? ` (${count})` : ''}
      </span>
    </span>
  );
}
