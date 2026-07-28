'use client';

import { Fragment, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import Card from './Card';
import Input from './Input';
import Button from './Button';
import { useSession } from '@/lib/useSession';
import { isValidIhnCode } from '@/lib/ihn-code-validate';
import { autoFormatIhnInput } from '@/lib/ihn-code-format';
import { safeHttpUrl } from '@/lib/sanitize';
import type { ProfileLayer, BiodataLayer } from '@/types';
import type { DoctorReport } from '@/lib/doctor-report';
import styles from './StringLookupClient.module.css';

interface LookupResponse {
  available: boolean;
  profile_layer: Partial<ProfileLayer>;
  biodata_layer: Partial<BiodataLayer>;
  /**
   * The organized report (worklist #29/#30) — built server-side (never in
   * the client) FROM this same already-sharing-prefs-filtered read, so a
   * doctor's name/contact can only ever arrive here already gated on an
   * `approved` doctor_consent_records row. `null` when nothing is shared.
   */
  report: DoctorReport | null;
}

/**
 * The "string tab" (worklist #24): look up a person's shareable biodata by
 * their IHN code alone (no internal user id needed — `ihn_code` is UNIQUE,
 * see migration 001), rendered as an organized document rather than raw
 * JSON. Consumes #23's sharing-prefs model exactly as-is via
 * `GET /api/biodata/lookup` — it can never show anything the account holder
 * hasn't explicitly opted into sharing.
 *
 * Requires being signed in as a patient, same as the underlying API (the
 * cross-user IHN read path was deliberately scoped to authenticated patient
 * sessions in #23 — this page doesn't loosen that, it's the UI on top of it).
 */
export default function StringLookupClient() {
  const { loading: sessionLoading, user } = useSession();
  const searchParams = useSearchParams();
  const [code, setCode] = useState('IHN-');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<LookupResponse | null>(null);
  const [searchedCode, setSearchedCode] = useState('');

  // A QR code generated from IHNCodeDisplay encodes a URL to this page with
  // ?ihn=<code> pre-filled, so scanning it lands here ready to search.
  useEffect(() => {
    const prefill = searchParams.get('ihn');
    if (prefill) setCode(autoFormatIhnInput(prefill));
  }, [searchParams]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);
    const normalized = code.trim().toUpperCase();
    if (!isValidIhnCode(normalized)) {
      setError('Enter a valid IHN code (format IHN-XXXX-XXXX-XXXX).');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/biodata/lookup?ihn=${encodeURIComponent(normalized)}`);
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? 'Could not complete the lookup.');
        return;
      }
      setResult(body);
      setSearchedCode(normalized);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (sessionLoading) {
    return <p>Loading…</p>;
  }

  if (!user) {
    return (
      <Card variant="plain" className={styles.gate}>
        <h1 className={styles.title}>Find by IHN</h1>
        <p className={styles.subtitle}>
          Sign in to look someone up by their IHN code — this keeps every lookup tied to an
          accountable, logged requester.
        </p>
        <Link href="/login" className={styles.gateLink}>
          <Button type="button">Sign in</Button>
        </Link>
      </Card>
    );
  }

  const report = result?.available ? result.report : null;
  const sections = report?.sections ?? [];

  return (
    <div className={styles.wrap}>
      <div className={styles.intro}>
        <h1 className={styles.title}>Find by IHN</h1>
        <p className={styles.subtitle}>
          Enter someone&apos;s IHN code to view whatever biodata they&apos;ve chosen to share — an
          organized summary, not raw data. Only fields the account holder has explicitly opted in
          to share will ever appear here.
        </p>
      </div>

      <Card variant="plain">
        <form className={styles.form} onSubmit={onSubmit} noValidate>
          <div className={styles.formRow}>
            <Input
              label="IHN code"
              value={code}
              onChange={(e) => setCode(autoFormatIhnInput(e.target.value))}
              placeholder="IHN-XXXX-XXXX-XXXX"
              autoComplete="off"
              required
            />
            <Button type="submit" disabled={submitting} className={styles.submit}>
              {submitting ? 'Looking up…' : 'Look up'}
            </Button>
          </div>
          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
        </form>
      </Card>

      {result && !result.available && (
        <Card variant="plain" className={styles.notFound} role="status">
          <p>No shareable record was found for that code.</p>
        </Card>
      )}

      {result && result.available && report && (
        <Card variant="plain" className={styles.docCard} as="section">
          <div className={styles.docHeader}>
            <div>
              <h2 className={styles.docTitle}>Biodata report — {searchedCode}</h2>
              <p className={styles.docSubtitle}>
                Generated {new Date(report.generatedAt).toLocaleString()}
              </p>
            </div>
            {/* Photo top-right, per worklist #29's layout requirement — reuses
                the existing profile_photo_url field (worklist #21), no new
                photo field. */}
            {safeHttpUrl(report.photoUrl) && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={safeHttpUrl(report.photoUrl)!} alt="Profile" className={styles.docPhoto} />
            )}
            <Button type="button" variant="ghost" className={styles.printBtn} onClick={() => window.print()}>
              Print
            </Button>
          </div>

          {sections.map((section) => (
            <div className={styles.section} key={section.key}>
              <h3 className={styles.sectionTitle}>{section.title}</h3>
              <div className={styles.rows}>
                {section.rows.map((row, i) => (
                  <Fragment key={`${section.key}-${i}`}>
                    <div className={styles.rowLabel}>{row.label}</div>
                    <div className={styles.rowValue}>{row.value}</div>
                  </Fragment>
                ))}
              </div>
            </div>
          ))}

          <p className={styles.declaration}>{report.declaration}</p>

          {report.signatures.length > 0 && (
            <div className={styles.signatureBlock}>
              <h3 className={styles.sectionTitle}>Doctor confirmation</h3>
              <ul className={styles.signatureList}>
                {report.signatures.map((sig) => (
                  <li key={sig.doctorId} className={styles.signature}>
                    <span className={styles.signatureName}>Dr. {sig.name}</span>
                    {sig.contact && <span className={styles.signatureContact}>{sig.contact}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className={styles.disclaimer}>
            Educational/emergency reference only — always confirm critical details with the
            person or a medical professional where possible.
          </p>
        </Card>
      )}
    </div>
  );
}
