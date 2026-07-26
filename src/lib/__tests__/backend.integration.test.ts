/**
 * Integration tests against a REAL Postgres (DATABASE_URL). Run with
 * `npm run test:integration`. They exercise SQL the mocked unit suite cannot:
 * the advisory-lock rate limiter, real session rows, and the trigram search path.
 * Each test uses random identifiers and cleans up after itself.
 *
 * Skips entirely when DATABASE_URL is unset so a DB-less checkout stays green.
 */
import { randomUUID } from 'node:crypto';
import { query, closePool } from '@/lib/db';
import { checkRateLimit, createSession, getSession, destroySession } from '@/lib/auth';
import { fetchDoctorAttributionLookup } from '@/lib/doctor-consent-db';

const hasDb = Boolean(process.env.DATABASE_URL);
const d = hasDb ? describe : describe.skip;

afterAll(async () => {
  if (hasDb) await closePool();
});

d('schema smoke', () => {
  it('connects and the core tables exist', async () => {
    const { rows } = await query<{ n: string }>(
      `SELECT count(*)::text AS n FROM information_schema.tables WHERE table_name = ANY($1)`,
      [['users', 'sessions', 'hospitals', 'rate_limit_events', 'audit_logs', 'biodata', 'first_aid_entries']],
    );
    expect(Number(rows[0]!.n)).toBeGreaterThanOrEqual(7);
  });
});

d('checkRateLimit (advisory-lock limiter)', () => {
  const bucket = `itest:${randomUUID()}`;
  afterAll(async () => {
    await query('DELETE FROM rate_limit_events WHERE bucket_key = $1', [bucket]);
  });

  it('allows up to the limit, then blocks', async () => {
    expect(await checkRateLimit(bucket, 3, 300)).toBe(true);
    expect(await checkRateLimit(bucket, 3, 300)).toBe(true);
    expect(await checkRateLimit(bucket, 3, 300)).toBe(true);
    expect(await checkRateLimit(bucket, 3, 300)).toBe(false);
  });
});

d('session lifecycle', () => {
  let userId = '';
  beforeAll(async () => {
    const email = `itest+${randomUUID()}@example.com`;
    const { rows } = await query<{ id: string }>(
      `INSERT INTO users (email, password_hash, account_type) VALUES ($1, 'x', 'patient') RETURNING id`,
      [email],
    );
    userId = rows[0]!.id;
  });
  afterAll(async () => {
    if (userId) await query('DELETE FROM users WHERE id = $1', [userId]); // cascades sessions
  });

  it('creates, resolves, and destroys a real session', async () => {
    const { token } = await createSession(userId, 'patient');
    const resolved = await getSession(token);
    expect(resolved?.user_id).toBe(userId);
    expect(resolved?.account_type).toBe('patient');

    await destroySession(token);
    expect(await getSession(token)).toBeNull();
  });
});

d('doctor consent is scoped to a (doctor, patient) pair — real regression test for the fabricated-attribution vulnerability (migration 016)', () => {
  let hospitalId = '';
  let doctorId = '';
  let patientAId = '';
  let patientBId = '';

  beforeAll(async () => {
    hospitalId = randomUUID();
    doctorId = randomUUID();
    await query(
      `INSERT INTO hospitals (id, name, service_type, status) VALUES ($1, $2, 'hospital', 'approved')`,
      [hospitalId, `ItestHospital-${hospitalId}`],
    );
    await query(
      `INSERT INTO doctors (id, hospital_id, name) VALUES ($1, $2, 'Dr. Itest')`,
      [doctorId, hospitalId],
    );
    const a = await query<{ id: string }>(
      `INSERT INTO users (email, password_hash, account_type) VALUES ($1, 'x', 'patient') RETURNING id`,
      [`itest-a+${randomUUID()}@example.com`],
    );
    patientAId = a.rows[0]!.id;
    const b = await query<{ id: string }>(
      `INSERT INTO users (email, password_hash, account_type) VALUES ($1, 'x', 'patient') RETURNING id`,
      [`itest-b+${randomUUID()}@example.com`],
    );
    patientBId = b.rows[0]!.id;

    // The doctor is APPROVED for patient A's record only.
    await query(
      `INSERT INTO doctor_consent_records (doctor_id, patient_user_id, consent_status, decided_at)
       VALUES ($1, $2, 'approved', now())`,
      [doctorId, patientAId],
    );
  });

  afterAll(async () => {
    await query('DELETE FROM doctors WHERE id = $1', [doctorId]);
    await query('DELETE FROM hospitals WHERE id = $1', [hospitalId]);
    await query('DELETE FROM users WHERE id = ANY($1)', [[patientAId, patientBId]]); // cascades consent rows
  });

  it("THE EXPLOIT: fabricating this same real doctor_id onto patient B's clinical_conditions must NOT be attributed", async () => {
    // This is exactly the attack: a patient copies a doctor_id from the public
    // roster (GET /api/hospitals/[id]) and PATCHes it onto their own record.
    const lookupForPatientB = await fetchDoctorAttributionLookup([doctorId], patientBId);
    expect(lookupForPatientB[doctorId]?.consentStatus).toBeNull();
  });

  it('the SAME doctor_id IS correctly attributed for the patient it was actually approved for', async () => {
    const lookupForPatientA = await fetchDoctorAttributionLookup([doctorId], patientAId);
    expect(lookupForPatientA[doctorId]?.consentStatus).toBe('approved');
    expect(lookupForPatientA[doctorId]?.doctor.name).toBe('Dr. Itest');
  });
});

d('trigram search path', () => {
  const id = randomUUID();
  const name = `ZzTrigramClinic-${id}`;
  beforeAll(async () => {
    await query(
      `INSERT INTO hospitals (id, name, service_type, status) VALUES ($1, $2, 'hospital', 'approved')`,
      [id, name],
    );
  });
  afterAll(async () => {
    await query('DELETE FROM hospitals WHERE id = $1', [id]);
  });

  it('finds a hospital by a leading-wildcard ILIKE (trigram-backed)', async () => {
    const { rows } = await query<{ id: string }>(
      `SELECT id FROM hospitals WHERE name ILIKE $1 ESCAPE '\\'`,
      ['%TrigramClinic%'],
    );
    expect(rows.some((r) => r.id === id)).toBe(true);
  });
});
