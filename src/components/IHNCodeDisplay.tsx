import { useEffect, useRef } from 'react';
import Card from './Card';
import styles from './IHNCodeDisplay.module.css';

/**
 * QR code (worklist #25): encodes a URL to the public "Find by IHN" lookup
 * page (`/string-lookup`) with this account's code pre-filled as `?ihn=`,
 * rather than the raw code text. Reasoning: someone scanning it (e.g. a
 * relative or first responder's phone) is taken straight to a working lookup
 * form with nothing to retype — a raw-code QR would still require the scanner
 * to manually navigate to the site and paste it in, which is strictly worse
 * for the emergency use case this is designed for. Generated fully
 * client-side (no new backend surface) via the `qrcode` package.
 */
export default function IHNCodeDisplay({ code }: { code: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current || typeof window === 'undefined') return;
    const url = `${window.location.origin}/string-lookup?ihn=${encodeURIComponent(code)}`;
    let cancelled = false;
    import('qrcode')
      .then((QRCode) => {
        if (cancelled || !canvasRef.current) return;
        return QRCode.toCanvas(canvasRef.current, url, { width: 140, margin: 1 });
      })
      .catch(() => {
        // QR generation is a nice-to-have, not load-bearing — the code text
        // above always works as a fallback if it fails silently.
      });
    return () => {
      cancelled = true;
    };
  }, [code]);

  return (
    <Card as="section" className={styles.card}>
      <h2 className={styles.title}>Your IHN access code</h2>
      <p className={styles.code}>{code}</p>
      <div className={styles.qrRow}>
        <canvas ref={canvasRef} className={styles.qrCanvas} aria-hidden="true" />
        <p className={styles.qrCaption}>
          Let someone scan this to open the &quot;Find by IHN&quot; lookup page with your code
          already filled in — quicker than reading it aloud in an emergency.
        </p>
      </div>
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
