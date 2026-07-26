'use client';

import { useState } from 'react';
import Input from './Input';
import Dropdown from './Dropdown';
import Button from './Button';
import { uploadFile } from '@/lib/upload-client';
import { FIRST_AID_TAGS } from '@/lib/first-aid-tags';
import type { FirstAidEntry, FirstAidCategory } from '@/types';
import styles from './FirstAidForm.module.css';

export interface FirstAidFormValues {
  title: string;
  category: FirstAidCategory;
  definition: string;
  description: string;
  signs_symptoms: string[];
  process: string;
  dos: string;
  donts: string;
  things_to_look_out_for: string;
  implications: string;
  indication: string;
  contraindications: string;
  images: string[];
  tags: string[];
}

// Split around `process` so the signs/symptoms picker can be rendered between
// them — worklist #34 explicitly asks for signs/symptoms BEFORE the procedure,
// in both field order and layout.
const BEFORE_PROCESS: Array<[keyof FirstAidFormValues, string]> = [
  ['definition', 'Definition'],
  ['description', 'Description'],
];
const FROM_PROCESS: Array<[keyof FirstAidFormValues, string]> = [
  ['process', 'Process'],
  ['dos', "Do's"],
  ['donts', "Don'ts"],
  ['things_to_look_out_for', 'Things to look out for'],
  ['implications', 'Implications'],
  ['indication', 'Indication'],
  ['contraindications', 'Contraindications'],
];

const MAX_IMAGES = 10;

function fromEntry(entry?: FirstAidEntry): FirstAidFormValues {
  return {
    title: entry?.title ?? '',
    category: entry?.category ?? 'procedure',
    definition: entry?.definition ?? '',
    description: entry?.description ?? '',
    signs_symptoms: entry?.signs_symptoms ?? [],
    process: entry?.process ?? '',
    dos: entry?.dos ?? '',
    donts: entry?.donts ?? '',
    things_to_look_out_for: entry?.things_to_look_out_for ?? '',
    implications: entry?.implications ?? '',
    indication: entry?.indication ?? '',
    contraindications: entry?.contraindications ?? '',
    images: entry?.images ?? [],
    tags: entry?.tags ?? [],
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
  const [imageUrlInput, setImageUrlInput] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  function set<K extends keyof FirstAidFormValues>(key: K, v: FirstAidFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: v }));
  }

  function toggleTag(tag: string) {
    setValues((prev) => ({
      ...prev,
      tags: prev.tags.includes(tag) ? prev.tags.filter((t) => t !== tag) : [...prev.tags, tag],
    }));
  }

  function toggleSignSymptom(tag: string) {
    setValues((prev) => ({
      ...prev,
      signs_symptoms: prev.signs_symptoms.includes(tag)
        ? prev.signs_symptoms.filter((t) => t !== tag)
        : [...prev.signs_symptoms, tag],
    }));
  }

  function addImage(url: string) {
    setValues((prev) =>
      prev.images.length >= MAX_IMAGES ? prev : { ...prev, images: [...prev.images, url] },
    );
  }

  function removeImage(index: number) {
    setValues((prev) => ({ ...prev, images: prev.images.filter((_, i) => i !== index) }));
  }

  function addImageUrl() {
    const url = imageUrlInput.trim();
    if (!url) return;
    addImage(url);
    setImageUrlInput('');
  }

  async function onPickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploadError(null);
    setUploading(true);
    try {
      addImage(await uploadFile(file));
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setUploading(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    await onSubmit(values);
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

      <div className={styles.field}>
        <label>Topic tags</label>
        <div className={styles.tagPicker}>
          {FIRST_AID_TAGS.map((tag) => {
            const on = values.tags.includes(tag);
            return (
              <button
                key={tag}
                type="button"
                aria-pressed={on}
                className={on ? `${styles.tagChip} ${styles.tagChipOn}` : styles.tagChip}
                onClick={() => toggleTag(tag)}
              >
                {tag}
              </button>
            );
          })}
        </div>
      </div>

      {BEFORE_PROCESS.map(([key, label]) => (
        <div key={key} className={styles.field}>
          <label htmlFor={`fa-${key}`}>{label}</label>
          <textarea
            id={`fa-${key}`}
            value={values[key] as string}
            onChange={(e) => set(key, e.target.value as FirstAidFormValues[typeof key])}
            rows={key === 'description' ? 5 : 3}
          />
        </div>
      ))}

      <div className={styles.field}>
        <label>Signs &amp; symptoms (indicates this entry applies)</label>
        <div className={styles.tagPicker}>
          {FIRST_AID_TAGS.map((tag) => {
            const on = values.signs_symptoms.includes(tag);
            return (
              <button
                key={tag}
                type="button"
                aria-pressed={on}
                className={on ? `${styles.tagChip} ${styles.tagChipOn}` : styles.tagChip}
                onClick={() => toggleSignSymptom(tag)}
              >
                {tag}
              </button>
            );
          })}
        </div>
      </div>

      {FROM_PROCESS.map(([key, label]) => (
        <div key={key} className={styles.field}>
          <label htmlFor={`fa-${key}`}>{label}</label>
          <textarea
            id={`fa-${key}`}
            value={values[key] as string}
            onChange={(e) => set(key, e.target.value as FirstAidFormValues[typeof key])}
            rows={key === 'process' ? 5 : 3}
          />
        </div>
      ))}

      <div className={styles.field}>
        <label>Images</label>
        {values.images.length > 0 && (
          <ul className={styles.imageGrid}>
            {values.images.map((src, i) => (
              <li key={src + i} className={styles.imageItem}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt="" />
                <button
                  type="button"
                  onClick={() => removeImage(i)}
                  aria-label={`Remove image ${i + 1}`}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
        {values.images.length < MAX_IMAGES && (
          <div className={styles.imageAddRow}>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={onPickImage}
              disabled={uploading}
              aria-label="Upload image file"
            />
            <input
              type="url"
              placeholder={uploading ? 'Uploading…' : 'or paste an image URL'}
              value={imageUrlInput}
              onChange={(e) => setImageUrlInput(e.target.value)}
              aria-label="Image URL"
            />
            <Button
              type="button"
              variant="ghost"
              onClick={addImageUrl}
              disabled={uploading || !imageUrlInput.trim()}
            >
              Add
            </Button>
          </div>
        )}
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
