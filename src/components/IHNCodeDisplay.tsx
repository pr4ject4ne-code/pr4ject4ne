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
      <details className={styles.why}>
        <summary className={styles.whySummary}>Why does this matter?</summary>
        <div className={styles.whyBody}>
          <p>
            In an emergency, every minute spent tracking down your medical history is a minute a
            hospital isn&apos;t treating you. Your biodata — blood group, genotype, chronic
            conditions, allergies, next of kin — lets any partner hospital in the network pull up
            the essentials the moment you (or whoever is with you) share your IHN code.
          </p>
          <ul className={styles.whyList}>
            <li>Faster triage — doctors see relevant history before you can explain it yourself.</li>
            <li>Safer treatment — known conditions, disabilities, and preferences reduce guesswork.</li>
            <li>Works even if you can&apos;t speak for yourself — a relative or friend with your code can share it on your behalf.</li>
            <li>You stay in control — the code is yours to share only with who you choose, and it only unlocks what you choose to fill in.</li>
          </ul>
        </div>
      </details>
    </Card>
  );
}
