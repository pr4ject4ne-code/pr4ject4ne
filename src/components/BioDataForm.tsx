'use client';

import { useMemo, useState } from 'react';
import Input from './Input';
import Dropdown from './Dropdown';
import Button from './Button';
import Card from './Card';
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

  const bmi = useMemo(() => {
    if (typeof biodata.height_cm === 'number' && typeof biodata.weight_kg === 'number') {
      const h = biodata.height_cm / 100;
      if (h > 0) return Math.round((biodata.weight_kg / (h * h)) * 10) / 10;
    }
    return undefined;
  }, [biodata.height_cm, biodata.weight_kg]);

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
      <Card as="section" className={styles.section}>
        <h2 className={styles.heading}>Profile</h2>
        <p className={styles.sub}>Freely visible. Required fields are marked.</p>
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

      <Card as="section" className={styles.section}>
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
        </div>

        <h3 className={styles.subheading}>Anthropometric measurements</h3>
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
