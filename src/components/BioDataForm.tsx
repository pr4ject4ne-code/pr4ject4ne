'use client';

import { useMemo, useState } from 'react';
import Input from './Input';
import Dropdown from './Dropdown';
import Button from './Button';
import Card from './Card';
import { uploadFile } from '@/lib/upload-client';
import type { ProfileLayer, BiodataLayer } from '@/types';
import styles from './BioDataForm.module.css';

interface BioDataFormProps {
  initialProfile: ProfileLayer;
  initialBiodata: BiodataLayer;
  onSave: (profile: ProfileLayer, biodata: BiodataLayer) => Promise<void>;
  saving?: boolean;
  saveError?: string | null;
}

const GENDER_OPTIONS = [
  { value: 'female', label: 'Female' },
  { value: 'male', label: 'Male' },
  { value: 'other', label: 'Other' },
  { value: 'prefer_not', label: 'Prefer not to say' },
];

const MARITAL_OPTIONS = [
  { value: 'single', label: 'Single' },
  { value: 'married', label: 'Married' },
  { value: 'divorced', label: 'Divorced' },
  { value: 'widowed', label: 'Widowed' },
];

const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map((g) => ({
  value: g,
  label: g,
}));

const GENOTYPES = ['AA', 'AS', 'AC', 'SS', 'SC'].map((g) => ({ value: g, label: g }));

const CLINICAL_CONDITION_OPTIONS = [
  'Hypertension',
  'Diabetes',
  'Asthma',
  'Sickle cell disease',
  'Tuberculosis',
  'HIV/AIDS',
  'Hepatitis B',
  'Epilepsy',
  'Peptic ulcer disease',
  'Chronic kidney disease',
  'Heart disease',
  'Cancer',
  'Thyroid disorder',
  'Mental health condition',
  'Other',
].map((c) => ({ value: c, label: c }));

function num(v: string): number | undefined {
  const n = Number(v);
  return v === '' || Number.isNaN(n) ? undefined : n;
}

export default function BioDataForm({
  initialProfile,
  initialBiodata,
  onSave,
  saving,
  saveError,
}: BioDataFormProps) {
  const [profile, setProfile] = useState<ProfileLayer>(initialProfile);
  const [biodata, setBiodata] = useState<BiodataLayer>(initialBiodata);
  const [errors, setErrors] = useState<Record<string, string>>({});
  // Profile photo upload (reuses the shared /api/uploads plumbing via uploadFile).
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  // Add-a-clinical-condition sub-form (selectable condition + free-text detail fields).
  const [ccCondition, setCcCondition] = useState('');
  const [ccOther, setCcOther] = useState('');
  const [ccCause, setCcCause] = useState('');
  const [ccDuration, setCcDuration] = useState('');
  const [ccProgression, setCcProgression] = useState('');
  const [ccComplication, setCcComplication] = useState('');
  const [ccCare, setCcCare] = useState('');

  const conditions = biodata.clinical_conditions ?? [];
  const ccName = (ccCondition === 'Other' ? ccOther : ccCondition).trim();

  async function onPickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-picking the same file
    if (!file) return;
    setPhotoError(null);
    setPhotoUploading(true);
    try {
      const url = await uploadFile(file);
      setP('profile_photo_url', url);
    } catch (err) {
      setPhotoError(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setPhotoUploading(false);
    }
  }

  function removePhoto() {
    // Deliberately `undefined`, not `null`: this only hides the photo from
    // this form's display, it does not delete the stored value server-side.
    // `undefined` is dropped by JSON.stringify, so the outgoing PATCH omits
    // the key entirely and the server-side value is left untouched.
    setP('profile_photo_url', undefined);
  }

  function addCondition() {
    if (!ccName) return;
    const entry = {
      condition: ccName,
      ...(ccCause.trim() ? { cause: ccCause.trim() } : {}),
      ...(ccDuration.trim() ? { duration: ccDuration.trim() } : {}),
      ...(ccProgression.trim() ? { progression: ccProgression.trim() } : {}),
      ...(ccComplication.trim() ? { complication: ccComplication.trim() } : {}),
      ...(ccCare.trim() ? { care: ccCare.trim() } : {}),
      timestamp: new Date().toISOString(),
    };
    setB('clinical_conditions', [...conditions, entry]);
    setCcCondition('');
    setCcOther('');
    setCcCause('');
    setCcDuration('');
    setCcProgression('');
    setCcComplication('');
    setCcCare('');
  }

  function removeCondition(index: number) {
    setB(
      'clinical_conditions',
      conditions.filter((_, i) => i !== index),
    );
  }

  const bmi = useMemo(() => {
    if (typeof biodata.height_cm === 'number' && typeof biodata.weight_kg === 'number') {
      const h = biodata.height_cm / 100;
      if (h > 0) return Math.round((biodata.weight_kg / (h * h)) * 10) / 10;
    }
    return undefined;
  }, [biodata.height_cm, biodata.weight_kg]);

  // Plain-language BMI category, shown alongside the formula so the number
  // means something to someone reading it for the first time. Standard WHO
  // adult cutoffs — display only, not medical advice.
  const bmiCategory = useMemo(() => {
    if (typeof bmi !== 'number') return undefined;
    if (bmi < 18.5) return 'Underweight';
    if (bmi < 25) return 'Normal range';
    if (bmi < 30) return 'Overweight';
    return 'Obese';
  }, [bmi]);

  function setP<K extends keyof ProfileLayer>(key: K, value: ProfileLayer[K]) {
    setProfile((p) => ({ ...p, [key]: value }));
  }
  function setB<K extends keyof BiodataLayer>(key: K, value: BiodataLayer[K]) {
    setBiodata((b) => ({ ...b, [key]: value }));
  }

  function validate(): boolean {
    const next: Record<string, string> = {};
    if (!profile.full_name?.trim()) next.full_name = 'Full name is required.';
    if (!profile.gender) next.gender = 'Gender is required.';
    if (!profile.phone?.trim()) next.phone = 'Phone is required.';
    if (!profile.email?.trim()) next.email = 'Email is required.';
    if (!profile.dob) next.dob = 'Date of birth is required.';
    if (!profile.next_of_kin?.trim()) next.next_of_kin = 'Next of kin contact is required.';
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    await onSave(profile, { ...biodata, bmi });
  }

  return (
    <form onSubmit={submit}>
      <Card variant="plain" as="section" className={styles.section}>
        <h2 className={styles.heading}>Profile</h2>
        <p className={styles.sub}>Freely visible. Required fields are marked.</p>

        <div className={styles.photoRow}>
          <div className={styles.photoPreview}>
            {profile.profile_photo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={profile.profile_photo_url} alt="Profile" />
            ) : (
              <span className={styles.photoPlaceholder} aria-hidden="true">
                {profile.full_name?.trim()?.[0]?.toUpperCase() ?? '?'}
              </span>
            )}
          </div>
          <div className={styles.photoControls}>
            <label className={styles.photoLabel} htmlFor="profile-photo-input">
              Profile photo
            </label>
            <input
              id="profile-photo-input"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={onPickPhoto}
              disabled={photoUploading}
              aria-label="Upload profile photo"
            />
            {profile.profile_photo_url && (
              <Button type="button" variant="ghost" onClick={removePhoto} disabled={photoUploading}>
                Remove photo
              </Button>
            )}
            {photoUploading && <span className={styles.sub}>Uploading…</span>}
            {photoError && (
              <p role="alert" className={styles.error}>
                {photoError}
              </p>
            )}
          </div>
        </div>

        <div className={styles.grid}>
          <Input
            label="Full name *"
            value={profile.full_name ?? ''}
            onChange={(e) => setP('full_name', e.target.value)}
            error={errors.full_name}
          />
          <Input
            label="Alias"
            value={profile.alias ?? ''}
            onChange={(e) => setP('alias', e.target.value)}
          />
          <Dropdown
            label="Gender *"
            options={GENDER_OPTIONS}
            placeholder="Select…"
            value={profile.gender ?? ''}
            onChange={(e) => setP('gender', e.target.value)}
            error={errors.gender}
          />
          <Input
            label="Phone *"
            type="tel"
            value={profile.phone ?? ''}
            onChange={(e) => setP('phone', e.target.value)}
            error={errors.phone}
          />
          <Input
            label="Email *"
            type="email"
            value={profile.email ?? ''}
            onChange={(e) => setP('email', e.target.value)}
            error={errors.email}
          />
          <Input
            label="Date of birth *"
            type="date"
            value={profile.dob ?? ''}
            onChange={(e) => setP('dob', e.target.value)}
            error={errors.dob}
          />
          <Input
            label="Next of kin contact *"
            value={profile.next_of_kin ?? ''}
            onChange={(e) => setP('next_of_kin', e.target.value)}
            error={errors.next_of_kin}
          />
          <Input
            label="Address"
            value={profile.address ?? ''}
            onChange={(e) => setP('address', e.target.value)}
          />
        </div>
        <label className={styles.checkbox}>
          <input
            type="checkbox"
            checked={profile.dob_visible ?? false}
            onChange={(e) => setP('dob_visible', e.target.checked)}
          />
          <span>Show my date of birth to other viewers</span>
        </label>
      </Card>

      <Card variant="plain" as="section" className={styles.section}>
        <h2 className={styles.heading}>Biodata</h2>
        <p className={styles.sub}>
          Locked behind your IHN code. Optional but recommended. Clinical fields are most reliable
          when taken from official records (lab reports, medical records) and remain unverified
          until doctor verification exists.
        </p>

        <h3 className={styles.subheading}>Lifestyle</h3>
        <div className={styles.grid}>
          <Input
            label="Chronic disease"
            value={biodata.chronic_disease ?? ''}
            onChange={(e) => setB('chronic_disease', e.target.value)}
          />
          <Input
            label="Occupation"
            value={biodata.occupation ?? ''}
            onChange={(e) => setB('occupation', e.target.value)}
          />
          <Dropdown
            label="Marital status"
            options={MARITAL_OPTIONS}
            placeholder="Select…"
            value={biodata.marital_status ?? ''}
            onChange={(e) => setB('marital_status', e.target.value)}
          />
          <Input
            label="Religious status"
            value={biodata.religious_status ?? ''}
            onChange={(e) => setB('religious_status', e.target.value)}
          />
          <Input
            label="Tribe"
            value={biodata.tribe ?? ''}
            onChange={(e) => setB('tribe', e.target.value)}
          />
          <Input
            label="Ethnicity"
            value={biodata.ethnicity ?? ''}
            onChange={(e) => setB('ethnicity', e.target.value)}
          />
        </div>

        <h3 className={styles.subheading}>Anthropometric measurements</h3>
        <p className={styles.sub}>
          All measurements are in centimetres (cm) and kilograms (kg). Waist: measured at the
          narrowest point, usually just above the navel. Chest: measured around the fullest part,
          under the arms. Hip: measured around the widest point of the hips/buttocks.
        </p>
        <div className={styles.grid}>
          <Input
            label="Height (cm)"
            type="number"
            value={biodata.height_cm ?? ''}
            onChange={(e) => setB('height_cm', num(e.target.value))}
          />
          <Input
            label="Weight (kg)"
            type="number"
            value={biodata.weight_kg ?? ''}
            onChange={(e) => setB('weight_kg', num(e.target.value))}
          />
          <Input
            label="Waist circumference (cm)"
            type="number"
            value={biodata.waist_cm ?? ''}
            onChange={(e) => setB('waist_cm', num(e.target.value))}
          />
          <Input
            label="Chest circumference (cm)"
            type="number"
            value={biodata.chest_cm ?? ''}
            onChange={(e) => setB('chest_cm', num(e.target.value))}
          />
          <Input
            label="Hip circumference (cm)"
            type="number"
            value={biodata.hip_cm ?? ''}
            onChange={(e) => setB('hip_cm', num(e.target.value))}
          />
          <Input label="BMI (calculated)" value={bmi ?? ''} readOnly disabled />
        </div>
        <p className={styles.doctorAid}>
          BMI = weight (kg) ÷ height (m)². Calculated automatically once height and weight are
          filled in.
          {bmiCategory ? (
            <>
              {' '}
              Your current value ({bmi}) falls in the <strong>{bmiCategory}</strong> range.
            </>
          ) : null}
        </p>
        <details className={styles.why}>
          <summary className={styles.whySummary}>What do BMI ranges mean?</summary>
          <div className={styles.whyBody}>
            <p>
              BMI is a simple screening number, not a diagnosis — it doesn&apos;t account for
              muscle mass, frame size, or where fat is carried. The commonly used adult ranges are:
            </p>
            <ul className={styles.whyList}>
              <li>Below 18.5 — Underweight</li>
              <li>18.5–24.9 — Normal range</li>
              <li>25–29.9 — Overweight</li>
              <li>30 and above — Obese</li>
            </ul>
          </div>
        </details>

        <h3 className={styles.subheading}>Recommended (from official documents)</h3>
        <div className={styles.grid}>
          <Dropdown
            label="Genotype"
            options={GENOTYPES}
            placeholder="Select…"
            value={biodata.genotype ?? ''}
            onChange={(e) => setB('genotype', e.target.value)}
          />
          <Dropdown
            label="Blood group"
            options={BLOOD_GROUPS}
            placeholder="Select…"
            value={biodata.blood_group ?? ''}
            onChange={(e) => setB('blood_group', e.target.value)}
          />
          <Input
            label="Disability"
            value={biodata.disability ?? ''}
            onChange={(e) => setB('disability', e.target.value)}
          />
          <Input
            label="Known health preferences"
            value={biodata.health_preferences ?? ''}
            onChange={(e) => setB('health_preferences', e.target.value)}
          />
        </div>
        <details className={styles.why}>
          <summary className={styles.whySummary}>What are genotype and blood group, and why do they matter?</summary>
          <div className={styles.whyBody}>
            <p>
              <strong>Genotype</strong> (AA, AS, AC, SS, SC) describes which haemoglobin genes you
              inherited from your parents. It is fixed at birth and never changes. It matters most
              for genetic-compatibility awareness — for example, before starting a family — and for
              understanding sickle-cell-related conditions (SS, SC). If you don&apos;t know yours, a
              simple lab test (haemoglobin electrophoresis) can confirm it.
            </p>
            <p>
              <strong>Blood group</strong> (e.g. O+, A-) identifies which blood types are safe for
              you to receive in a transfusion. Hospitals need it on file so that, in an emergency,
              compatible blood can be found immediately instead of being tested for on the spot.
            </p>
          </div>
        </details>

        <h3 className={styles.subheading}>Clinical / chronic disease conditions</h3>
        <p className={styles.sub}>
          Select a condition and note its duration, progression, complications, care, and cause.
          Each entry is timestamped when added.
        </p>
        <p className={styles.doctorAid}>
          Recommended: get these details from a doctor or official medical record where possible.
          Duration, progression, and complications are most reliable with clinical input.
        </p>
        {conditions.length > 0 && (
          <ul className={styles.conditionList}>
            {conditions.map((c, i) => (
              <li key={`${c.condition}-${c.timestamp ?? i}`} className={styles.conditionItem}>
                <div>
                  <strong>{c.condition}</strong>
                  {c.cause ? <span className={styles.conditionCause}> — cause: {c.cause}</span> : null}
                  {c.duration ? <span className={styles.conditionCause}> — duration: {c.duration}</span> : null}
                  {c.progression ? (
                    <span className={styles.conditionCause}> — progression: {c.progression}</span>
                  ) : null}
                  {c.complication ? (
                    <span className={styles.conditionCause}> — complication: {c.complication}</span>
                  ) : null}
                  {c.care ? <span className={styles.conditionCause}> — care: {c.care}</span> : null}
                  {c.timestamp ? (
                    <span className={styles.conditionTime}>
                      {new Date(c.timestamp).toLocaleDateString()}
                    </span>
                  ) : null}
                </div>
                <button
                  type="button"
                  className={styles.removeBtn}
                  onClick={() => removeCondition(i)}
                  aria-label={`Remove ${c.condition}`}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className={styles.conditionAdd}>
          <Dropdown
            label="Condition (disease)"
            options={CLINICAL_CONDITION_OPTIONS}
            placeholder="Select…"
            value={ccCondition}
            onChange={(e) => setCcCondition(e.target.value)}
          />
          {ccCondition === 'Other' && (
            <Input
              label="Specify condition"
              value={ccOther}
              onChange={(e) => setCcOther(e.target.value)}
            />
          )}
          <Input
            label="Duration"
            placeholder="e.g. 3 years"
            value={ccDuration}
            onChange={(e) => setCcDuration(e.target.value)}
          />
          <Input
            label="Progression"
            placeholder="e.g. stable, worsening"
            value={ccProgression}
            onChange={(e) => setCcProgression(e.target.value)}
          />
          <Input
            label="Complication"
            value={ccComplication}
            onChange={(e) => setCcComplication(e.target.value)}
          />
          <Input
            label="Care"
            placeholder="e.g. current management"
            value={ccCare}
            onChange={(e) => setCcCare(e.target.value)}
          />
          <Input
            label="Cause / notes"
            value={ccCause}
            onChange={(e) => setCcCause(e.target.value)}
          />
          <div className={styles.conditionAddAction}>
            <Button type="button" variant="ghost" onClick={addCondition} disabled={!ccName}>
              Add condition
            </Button>
          </div>
        </div>
      </Card>

      {saveError && (
        <p role="alert" className={styles.error}>
          {saveError}
        </p>
      )}
      <div className={styles.actions}>
        <Button type="submit" disabled={saving}>
          {saving ? 'Saving…' : 'Save biodata'}
        </Button>
      </div>
    </form>
  );
}
