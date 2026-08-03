'use client';

import { useState } from 'react';
import Input from './Input';
import Dropdown from './Dropdown';
import Button from './Button';
import ErrorBubble from './ErrorBubble';
import { uploadFile } from '@/lib/upload-client';
import { useKeyboardSafeFocus } from '@/lib/useKeyboardSafeFocus';
import { safeHttpUrl } from '@/lib/sanitize';
import { FIRST_AID_TAGS } from '@/lib/first-aid-tags';
import { REGION_TAGS } from '@/lib/first-aid-region-tags';
import { SYSTEM_TAGS } from '@/lib/first-aid-system-tags';
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
  region_tags: string[];
  system_tags: string[];
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
    region_tags: entry?.region_tags ?? [],
    system_tags: entry?.system_tags ?? [],
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
  // Raw <textarea>s, so they bypass Input.tsx's shared mobile-keyboard wiring
  // and need it applied directly. One shared instance is enough for all of
  // them: only one can be focused at a time, and blur of the old field fires
  // before focus of the new one, so the watcher is always released first.
  const keyboardSafe = useKeyboardSafeFocus<HTMLTextAreaElement>();

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

  function toggleRegionTag(tag: string) {
    setValues((prev) => ({
      ...prev,
      region_tags: prev.region_tags.includes(tag)
        ? prev.region_tags.filter((t) => t !== tag)
        : [...prev.region_tags, tag],
    }));
  }

  function toggleSystemTag(tag: string) {
    setValues((prev) => ({
      ...prev,
      system_tags: prev.system_tags.includes(tag)
        ? prev.system_tags.filter((t) => t !== tag)
        : [...prev.system_tags, tag],
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
                className={on ? styles.tagChipOn : styles.tagChip}
                onClick={() => toggleTag(tag)}
              >
                {tag}
              </button>
            );
          })}
        </div>
      </div>

      <div className={styles.field}>
        <label>Region</label>
        <div className={styles.tagPicker}>
          {REGION_TAGS.map((tag) => {
            const on = values.region_tags.includes(tag);
            return (
              <button
                key={tag}
                type="button"
                aria-pressed={on}
                className={on ? styles.tagChipOn : styles.tagChip}
                onClick={() => toggleRegionTag(tag)}
              >
                {tag}
              </button>
            );
          })}
        </div>
      </div>

      <div className={styles.field}>
        <label>System</label>
        <div className={styles.tagPicker}>
          {SYSTEM_TAGS.map((tag) => {
            const on = values.system_tags.includes(tag);
            return (
              <button
                key={tag}
                type="button"
                aria-pressed={on}
                className={on ? styles.tagChipOn : styles.tagChip}
                onClick={() => toggleSystemTag(tag)}
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
            {...keyboardSafe}
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
                className={on ? styles.tagChipOn : styles.tagChip}
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
            {...keyboardSafe}
          />
        </div>
      ))}

      <div className={styles.field}>
        <label>Images</label>
        {values.images.length > 0 && (
          <ul className={styles.imageGrid}>
            {values.images.map((src, i) => (
              <li key={src + i} className={styles.imageItem}>
                {/* Re-validate scheme before rendering, matching the same
                    render-time guard FirstAidDetail.tsx/FirstAidList.tsx use
                    for saved entries — a pasted javascript:/data: URL here
                    would otherwise render in this preview before the
                    server-side check on submit ever runs. */}
                {safeHttpUrl(src) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={safeHttpUrl(src)!} alt="" />
                ) : (
                  <span className={styles.imageInvalid}>Invalid image URL</span>
                )}
                <button
                  type="button"
                  className={styles.removeImage}
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
        <ErrorBubble variant="banner" message={uploadError} />
      </div>

      <ErrorBubble variant="banner" message={error} />
      <Button type="submit" disabled={submitting}>
        {submitting ? 'Saving…' : entry ? 'Save changes' : 'Create entry'}
      </Button>
    </form>
  );
}
