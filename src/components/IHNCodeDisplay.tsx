import { useEffect, useRef, useState } from 'react';
import Card from './Card';
import Button from './Button';
import Input from './Input';
import ErrorBubble from './ErrorBubble';
import styles from './IHNCodeDisplay.module.css';

const COOLDOWN_DAYS = 30;

/** Days remaining before a regeneration is allowed again, or 0 if eligible now. */
function cooldownDaysLeft(regeneratedAt: string | null, createdAt: string | null): number {
  const reference = regeneratedAt ?? createdAt;
  if (!reference) return 0;
  const msSince = Date.now() - new Date(reference).getTime();
  const msLeft = COOLDOWN_DAYS * 24 * 60 * 60 * 1000 - msSince;
  return Math.max(0, Math.ceil(msLeft / (24 * 60 * 60 * 1000)));
}

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
interface IHNCodeDisplayProps {
  code: string;
  /** When the code was last regenerated, or `null` if it never has been. */
  regeneratedAt?: string | null;
  /** Falls back reference point for the cooldown when never regenerated. */
  createdAt?: string | null;
  /** Called with the new code once a regeneration succeeds, so the parent can
   * update its own state (and this component's QR/text) without a reload. */
  onRegenerated?: (newCode: string) => void;
}

export default function IHNCodeDisplay({
  code,
  regeneratedAt = null,
  createdAt = null,
  onRegenerated,
}: IHNCodeDisplayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [copied, setCopied] = useState(false);
  const [regenerateOpen, setRegenerateOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [regenerating, setRegenerating] = useState(false);
  const [regenerateError, setRegenerateError] = useState<string | null>(null);

  const daysLeft = cooldownDaysLeft(regeneratedAt, createdAt);

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be denied/unavailable — the code text is always
      // visible and selectable, so this is a nice-to-have, not load-bearing.
    }
  }

  async function submitRegenerate(e: React.FormEvent) {
    e.preventDefault();
    setRegenerating(true);
    setRegenerateError(null);
    try {
      const res = await fetch('/api/biodata/ihn-code/regenerate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ current_password: password }),
      });
      const body = await res.json();
      if (!res.ok) {
        setRegenerateError(body.error ?? 'Could not regenerate your code.');
        return;
      }
      setPassword('');
      setRegenerateOpen(false);
      onRegenerated?.(body.ihn_code);
    } catch {
      setRegenerateError('Network error. Please try again.');
    } finally {
      setRegenerating(false);
    }
  }

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
    <Card variant="plain" as="section" className={styles.card}>
      <h2 className={styles.title}>Your IHN access code</h2>
      <div className={styles.codeRow}>
        <p className={styles.code}>{code}</p>
        <Button type="button" variant="ghost" onClick={copyCode} className={styles.copyBtn}>
          {copied ? 'Copied!' : 'Copy'}
        </Button>
      </div>
      <div className={styles.qrRow}>
        <canvas ref={canvasRef} className={styles.qrCanvas} aria-hidden="true" />
        <p className={styles.qrCaption}>
          Let someone scan this to open the &quot;Find by IHN&quot; lookup page with your code
          already filled in (quicker than reading it aloud in an emergency).
        </p>
      </div>
      <p className={styles.note}>
        This is your <strong>emergency access key</strong>. Share it with close relatives or friends
        so they can view your biodata in an emergency. It stays the same until you choose to
        regenerate it below.
      </p>
      <details className={styles.why}>
        <summary className={styles.whySummary}>Why does this matter?</summary>
        <div className={styles.whyBody}>
          <p>
            In an emergency, every minute spent tracking down your medical history is a minute a
            hospital isn&apos;t treating you. Your biodata (blood group, genotype, chronic
            conditions, allergies, next of kin) lets any partner hospital in the network pull up
            the essentials the moment you or whoever is with you shares your IHN code.
          </p>
          <ul className={styles.whyList}>
            <li>Faster triage: doctors see relevant history before you can explain it yourself.</li>
            <li>Safer treatment: known conditions, disabilities, and preferences reduce guesswork.</li>
            <li>Works even if you can&apos;t speak for yourself. A relative or friend with your code can share it on your behalf.</li>
            <li>You stay in control. The code is yours to share only with who you choose, and it only unlocks what you choose to fill in.</li>
          </ul>
        </div>
      </details>

      <details className={styles.why} open={regenerateOpen}>
        <summary
          className={styles.whySummary}
          onClick={(e) => {
            e.preventDefault();
            setRegenerateOpen((o) => !o);
          }}
        >
          Regenerate this code
        </summary>
        <div className={styles.whyBody}>
          {daysLeft > 0 ? (
            <p>
              You can regenerate your code again in {daysLeft} day{daysLeft === 1 ? '' : 's'}.
              Regenerating is limited so the code stays a stable, memorable key rather than one
              that changes on a whim.
            </p>
          ) : (
            <form onSubmit={submitRegenerate}>
              <p>
                Generating a new code immediately invalidates the old one. Anyone you previously
                shared it with (relatives, first responders, a printed copy) will need the new
                code to look up your biodata.
              </p>
              <Input
                label="Confirm your password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <ErrorBubble variant="banner" message={regenerateError} />
              <Button type="submit" disabled={regenerating || !password}>
                {regenerating ? 'Regenerating…' : 'Regenerate code'}
              </Button>
            </form>
          )}
        </div>
      </details>
    </Card>
  );
}
