'use client';

import { useState } from 'react';
import Input from './Input';
import Dropdown from './Dropdown';
import Button from './Button';
import { uploadFile } from '@/lib/upload-client';
import type { FirstAidEntry, FirstAidCategory } from '@/types';
import styles from './FirstAidForm.module.css';

export interface FirstAidFormValues {
  title: string;
  category: FirstAidCategory;
  definition: string;
  description: string;
  process: string;
  dos: string;
  donts: string;
  things_to_look_out_for: string;
  implications: string;
  indication: string;
  contraindications: string;
  images: string[];
}

const TEXT_AREAS: Array<[keyof FirstAidFormValues, string]> = [
  ['definition', 'Definition'],
  ['description', 'Description'],
  ['process', 'Process'],
  ['dos', "Do's"],
  ['donts', "Don'ts"],
  ['things_to_look_out_for', 'Things to look out for'],
  ['implications', 'Implications'],
  ['indication', 'Indication'],
  ['contraindications', 'Contraindications'],
];

function fromEntry(entry?: FirstAidEntry): FirstAidFormValues {
  return {
    title: entry?.title ?? '',
    category: entry?.category ?? 'procedure',
    definition: entry?.definition ?? '',
    description: entry?.description ?? '',
    process: entry?.process ?? '',
    dos: entry?.dos ?? '',
    donts: entry?.donts ?? '',
    things_to_look_out_for: entry?.things_to_look_out_for ?? '',
    implications: entry?.implications ?? '',
    indication: entry?.indication ?? '',
    contraindications: entry?.contraindications ?? '',
    images: entry?.images ?? [],
  };
}

interface FirstAidFormProps {
  entry?: FirstAidEntry;
  onSubmit: (values: FirstAidFormValues) => Promise<void>;
  submitting?: boolean;
  error?: string | null;
}

export default function FirstAidForm({ entry, onSubmit, submitting, error }: FirstAidFormProps) {
  const [values, setValues] = useState<FirstAidFormValues>(() => fromEntry(entry));
  const [imagesText, setImagesText] = useState(values.images.join('\n'));
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  function set<K extends keyof FirstAidFormValues>(key: K, v: FirstAidFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: v }));
  }

  async function onPickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploadError(null);
    setUploading(true);
    try {
      const url = await uploadFile(file);
      setImagesText((prev) => (prev.trim() ? `${prev.trim()}\n${url}` : url));
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setUploading(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const images = imagesText
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    await onSubmit({ ...values, images });
  }

  return (
    <form onSubmit={submit} className={styles.form}>
      <Input
        label="Title *"
        value={values.title}
        onChange={(e) => set('title', e.target.value)}
        required
      />
      <Dropdown
        label="Category *"
        options={[
          { value: 'procedure', label: 'Procedure' },
          { value: 'technique', label: 'Technique' },
        ]}
        value={values.category}
        onChange={(e) => set('category', e.target.value as FirstAidCategory)}
      />

      {TEXT_AREAS.map(([key, label]) => (
        <div key={key} className={styles.field}>
          <label htmlFor={`fa-${key}`}>{label}</label>
          <textarea
            id={`fa-${key}`}
            value={values[key] as string}
            onChange={(e) => set(key, e.target.value as FirstAidFormValues[typeof key])}
            rows={key === 'process' || key === 'description' ? 5 : 3}
          />
        </div>
      ))}

      <div className={styles.field}>
        <label htmlFor="fa-images">Images</label>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={onPickImage}
          disabled={uploading}
          aria-label="Upload image file"
        />
        <textarea
          id="fa-images"
          value={imagesText}
          onChange={(e) => setImagesText(e.target.value)}
          rows={3}
          placeholder={uploading ? 'Uploading…' : 'Uploaded image URLs appear here (one per line); you can also paste URLs'}
        />
        {uploadError && (
          <p role="alert" style={{ color: 'var(--color-danger, #c0392b)', fontSize: '0.85rem' }}>
            {uploadError}
          </p>
        )}
      </div>

      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      <Button type="submit" disabled={submitting}>
        {submitting ? 'Saving…' : entry ? 'Save changes' : 'Create entry'}
      </Button>
    </form>
  );
}
