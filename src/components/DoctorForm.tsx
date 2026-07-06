'use client';

import { useState } from 'react';
import Input from './Input';
import Dropdown from './Dropdown';
import Button from './Button';

export interface DoctorFormValues {
  name: string;
  specialty: string;
  level: string;
}

const LEVELS = [
  { value: 'consultant', label: 'Consultant' },
  { value: 'senior_registrar', label: 'Senior Registrar' },
  { value: 'registrar', label: 'Registrar' },
  { value: 'intern', label: 'Intern' },
  { value: 'other', label: 'Other' },
];

interface DoctorFormProps {
  initial?: Partial<DoctorFormValues>;
  onSubmit: (values: DoctorFormValues) => Promise<void>;
  submitting?: boolean;
  submitLabel?: string;
}

export default function DoctorForm({ initial, onSubmit, submitting, submitLabel }: DoctorFormProps) {
  const [name, setName] = useState(initial?.name ?? '');
  const [specialty, setSpecialty] = useState(initial?.specialty ?? '');
  const [level, setLevel] = useState(initial?.level ?? '');
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError('Name is required.');
      return;
    }
    setError(null);
    await onSubmit({ name, specialty, level });
  }

  return (
    <form onSubmit={submit}>
      <Input label="Name *" value={name} onChange={(e) => setName(e.target.value)} error={error ?? undefined} />
      <Input label="Specialty" value={specialty} onChange={(e) => setSpecialty(e.target.value)} />
      <Dropdown
        label="Level"
        options={LEVELS}
        placeholder="Select…"
        value={level}
        onChange={(e) => setLevel(e.target.value)}
      />
      <Button type="submit" disabled={submitting}>
        {submitting ? 'Saving…' : (submitLabel ?? 'Save doctor')}
      </Button>
    </form>
  );
}
