import Card from './Card';
import styles from './IHNCodeDisplay.module.css';

export default function IHNCodeDisplay({ code }: { code: string }) {
  return (
    <Card as="section" className={styles.card}>
      <h2 className={styles.title}>Your IHN access code</h2>
      <p className={styles.code}>{code}</p>
      <p className={styles.note}>
        This is your <strong>emergency access key</strong>. Share it with close relatives or friends
        so they can view your biodata in an emergency. <strong>This code never changes.</strong>
      </p>
    </Card>
  );
}
