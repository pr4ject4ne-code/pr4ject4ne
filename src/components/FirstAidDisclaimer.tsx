import { FIRST_AID_DISCLAIMER } from '@/lib/first-aid-search';
import styles from './FirstAidDisclaimer.module.css';

export default function FirstAidDisclaimer() {
  return (
    <p className={styles.disclaimer} role="note">
      {FIRST_AID_DISCLAIMER}
    </p>
  );
}
