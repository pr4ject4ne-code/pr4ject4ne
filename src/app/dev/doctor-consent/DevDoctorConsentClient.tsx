'use client';

import { useCallback, useEffect, useState } from 'react';
import DevShell from '../DevShell';
import { useDevGuard } from '../useDevGuard';
import Card from '@/components/Card';
import Input from '@/components/Input';
import Dropdown from '@/components/Dropdown';
import Button from '@/components/Button';
import ErrorBubble from '@/components/ErrorBubble';
import { authFetch } from '@/lib/authFetch';
import type { ConsentStatus } from '@/types';
import styles from '../primary/DevPrimary.module.css';

interface PatientRow {
  id: string;
  email: string;
  created_at: string;
}

interface DoctorRow {
  id: string;
  name: string;
  specialty: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  hospital_id: string;
  hospital_name: string;
  consent_id: string | null;
  consent_status: ConsentStatus | null;
  contacted_via: string | null;
  denial_reason: string | null;
  decided_at: string | null;
  consent_recorded_at: string | null;
}

const STATUS_LABEL: Record<ConsentStatus, string> = {
  pending: 'Pending',
  approved: 'Approved',
  denied: 'Denied',
};

/**
 * Doctor consent recording (worklist #30) — a PRIMARY developer identifies
 * BOTH a target patient AND a doctor (each searched the same way), sees the
 * doctor's current consent status for THAT EXACT PATIENT (derived from the
 * most recent doctor_consent_records row for this (doctor, patient) pair, or
 * "not yet contacted" if none exists), and records the outcome of an
 * out-of-band contact (phone/email, outside this app).
 *
 * Consent is scoped to the (doctor, patient) pair — never a blanket
 * per-doctor approval (migration 016 fixed a real vulnerability where a
 * doctor approved for one patient's record could be fabricated onto another
 * patient's clinical_conditions entry and would have been wrongly credited).
 */
export default function DevDoctorConsentClient() {
  const { loading, dev } = useDevGuard();

  const [patientQuery, setPatientQuery] = useState('');
  const [patients, setPatients] = useState<PatientRow[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<PatientRow | null>(null);

  const [doctorQuery, setDoctorQuery] = useState('');
  const [doctors, setDoctors] = useState<DoctorRow[]>([]);
  const [selectedDoctor, setSelectedDoctor] = useState<string | null>(null);

  const [contactedVia, setContactedVia] = useState('');
  const [doctorEmail, setDoctorEmail] = useState('');
  const [doctorSignature, setDoctorSignature] = useState('');
  const [status, setStatus] = useState<ConsentStatus>('approved');
  const [denialReason, setDenialReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const loadPatients = useCallback(async (q: string) => {
    const res = await authFetch(
      `/api/dev/doctor-consent?resource=patients&q=${encodeURIComponent(q)}&limit=50`,
      undefined,
      { onUnauthenticated: setError },
    );
    if (res.status === 401) return;
    if (res.ok) setPatients((await res.json()).patients ?? []);
  }, []);

  const loadDoctors = useCallback(async (q: string, patientUserId: string) => {
    const res = await authFetch(
      `/api/dev/doctor-consent?q=${encodeURIComponent(q)}&patient_user_id=${encodeURIComponent(patientUserId)}&limit=50`,
      undefined,
      { onUnauthenticated: setError },
    );
    if (res.status === 401) return;
    if (res.ok) setDoctors((await res.json()).doctors ?? []);
  }, []);

  useEffect(() => {
    if (!loading && dev?.is_primary) loadPatients('');
  }, [loading, dev, loadPatients]);

  useEffect(() => {
    if (selectedPatient) loadDoctors(doctorQuery, selectedPatient.id);
    // Re-fetch whenever the selected patient changes (doctorQuery deliberately
    // NOT a dependency here — that re-fetch is driven by the search submit).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPatient]);

  function searchPatients(e: React.FormEvent) {
    e.preventDefault();
    loadPatients(patientQuery);
  }

  function pickPatient(p: PatientRow) {
    setSelectedPatient(p);
    setSelectedDoctor(null);
    setDoctors([]);
    setError(null);
    setMessage(null);
  }

  function searchDoctors(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedPatient) return;
    loadDoctors(doctorQuery, selectedPatient.id);
  }

  function pickDoctor(d: DoctorRow) {
    setSelectedDoctor(d.id);
    // Prefill from the roster's own contact email as a starting point — the
    // dev can still change it to whatever address the doctor actually
    // replied from (see migration 019's rationale).
    setDoctorEmail(d.contact_email ?? '');
    setDoctorSignature('');
  }

  async function recordConsent(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    if (!selectedPatient) {
      setError('Select a patient first.');
      return;
    }
    if (!selectedDoctor) {
      setError('Select a doctor first.');
      return;
    }
    const res = await authFetch(
      '/api/dev/doctor-consent',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          doctor_id: selectedDoctor,
          patient_user_id: selectedPatient.id,
          consent_status: status,
          contacted_via: contactedVia,
          doctor_email: doctorEmail,
          doctor_signature: doctorSignature,
          denial_reason: status === 'denied' ? denialReason : undefined,
        }),
      },
      { onUnauthenticated: setError },
    );
    if (res.status === 401) return;
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? 'Could not record consent.');
      return;
    }
    setMessage('Consent outcome recorded.');
    setContactedVia('');
    setDoctorEmail('');
    setDoctorSignature('');
    setDenialReason('');
    loadDoctors(doctorQuery, selectedPatient.id);
  }

  if (loading) {
    return (
      <DevShell title="Doctor consent" showNav={false}>
        <p>Loading…</p>
      </DevShell>
    );
  }

  if (!dev?.is_primary) {
    return (
      <DevShell title="Doctor consent" dev={dev}>
        <p>You do not have admin access.</p>
      </DevShell>
    );
  }

  return (
    <DevShell title="Doctor consent" dev={dev}>
      <section className={styles.section}>
        <p style={{ color: 'var(--color-muted)', marginTop: 0 }}>
          Record the outcome of contacting a doctor <strong>out-of-band</strong> (phone/email,
          outside this app) about whether they consent to their name/contact appearing in a
          generated report, <strong>for one specific patient&apos;s record</strong>. A
          doctor+patient pair with no record here is treated as <strong>not consented</strong>:
          reports never attribute a field to a doctor without an approved record for that exact
          patient.
        </p>

        <Card variant="plain" style={{ marginBottom: '1rem' }}>
          <h2 style={{ fontSize: '1.05rem', marginTop: 0 }}>1. Select the patient</h2>
          <form onSubmit={searchPatients} className={styles.createForm}>
            <Input
              label="Search patient by email"
              value={patientQuery}
              onChange={(e) => setPatientQuery(e.target.value)}
              placeholder="e.g. patient@example.com"
            />
            <Button type="submit">Search</Button>
          </form>
          <ul className={styles.accountList}>
            {patients.map((p) => (
              <li key={p.id} className={styles.account}>
                <div>
                  <strong>{p.email}</strong>
                  {selectedPatient?.id === p.id && <span className={styles.badge}>Selected</span>}
                </div>
                <div className={styles.accountActions}>
                  <button type="button" onClick={() => pickPatient(p)}>
                    {selectedPatient?.id === p.id ? 'Selected' : 'Select'}
                  </button>
                </div>
              </li>
            ))}
            {patients.length === 0 && <li className={styles.account}>No patients found.</li>}
          </ul>
        </Card>

        {selectedPatient && (
          <Card variant="plain" style={{ marginBottom: '1rem' }}>
            <h2 style={{ fontSize: '1.05rem', marginTop: 0 }}>
              2. Select the doctor (for {selectedPatient.email})
            </h2>
            <form onSubmit={searchDoctors} className={styles.createForm}>
              <Input
                label="Search doctor or hospital"
                value={doctorQuery}
                onChange={(e) => setDoctorQuery(e.target.value)}
                placeholder="e.g. Ada Obi or Memfys"
              />
              <Button type="submit">Search</Button>
            </form>

            <ul className={styles.accountList}>
              {doctors.map((d) => (
                <li key={d.id} className={styles.account}>
                  <div>
                    <strong>{d.name}</strong>
                    <span className={styles.badge}>{d.hospital_name}</span>
                    {d.contact_email && <span className={styles.badge}>{d.contact_email}</span>}
                    {d.consent_status ? (
                      <span
                        className={d.consent_status === 'denied' ? styles.revoked : styles.badge}
                        style={
                          d.consent_status === 'approved'
                            ? { background: 'var(--color-green)', color: '#fff' }
                            : undefined
                        }
                      >
                        {STATUS_LABEL[d.consent_status]}
                      </span>
                    ) : (
                      <span className={styles.revoked}>Not yet contacted (for this patient)</span>
                    )}
                  </div>
                  <div className={styles.accountActions}>
                    <button type="button" onClick={() => pickDoctor(d)}>
                      {selectedDoctor === d.id ? 'Selected' : 'Record outcome'}
                    </button>
                  </div>
                </li>
              ))}
              {doctors.length === 0 && <li className={styles.account}>No doctors found.</li>}
            </ul>
          </Card>
        )}

        {selectedPatient && selectedDoctor && (
          <Card variant="plain" style={{ marginTop: '1rem' }}>
            <form onSubmit={recordConsent} className={styles.createForm} style={{ gridTemplateColumns: '1fr 1fr auto' }}>
              <Input
                label="Contacted via"
                value={contactedVia}
                onChange={(e) => setContactedVia(e.target.value)}
                placeholder="e.g. phone call 2026-07-26"
              />
              <Input
                label="Doctor's email"
                type="email"
                value={doctorEmail}
                onChange={(e) => setDoctorEmail(e.target.value)}
                placeholder="the address actually used, if different"
              />
              <Dropdown
                label="Outcome"
                value={status}
                onChange={(e) => setStatus(e.target.value as ConsentStatus)}
                options={[
                  { value: 'pending', label: 'Pending (contacted, awaiting reply)' },
                  { value: 'approved', label: 'Approved (consents to attribution for this patient)' },
                  { value: 'denied', label: 'Denied (declines attribution)' },
                ]}
              />
              <Button type="submit">Save</Button>
              <div style={{ gridColumn: '1 / -1' }}>
                <Input
                  label="Doctor's signature / attestation (optional)"
                  value={doctorSignature}
                  onChange={(e) => setDoctorSignature(e.target.value)}
                  placeholder="e.g. paste the doctor's signed email reply, or note a signed form on file"
                />
              </div>
              {status === 'denied' && (
                <div style={{ gridColumn: '1 / -1' }}>
                  <Input
                    label="Denial reason (optional)"
                    value={denialReason}
                    onChange={(e) => setDenialReason(e.target.value)}
                  />
                </div>
              )}
            </form>
            <ErrorBubble message={error} />
            {message && <p style={{ color: 'var(--color-green)' }}>{message}</p>}
          </Card>
        )}
      </section>
    </DevShell>
  );
}
