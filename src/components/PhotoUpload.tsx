'use client';

import { useState } from 'react';
import Button from './Button';
import Modal from './Modal';
import ErrorBubble from './ErrorBubble';
import { uploadFile } from '@/lib/upload-client';
import type { HospitalPhoto } from '@/types';
import styles from './PhotoUpload.module.css';

const SLOTS: Array<{ value: HospitalPhoto['slot']; label: string }> = [
  { value: 'outside_far', label: 'Outside (far)' },
  { value: 'outside_close', label: 'Outside (entrance)' },
  { value: 'reception', label: 'Reception' },
  { value: 'other', label: 'Other' },
];

interface PhotoUploadProps {
  photos: HospitalPhoto[];
  onSave: (photos: HospitalPhoto[]) => Promise<void>;
  saving?: boolean;
}

/**
 * Manage up to 5 hospital photos. Photos can be uploaded from the device (stored
 * via /api/uploads → object storage) or added by URL as a fallback.
 */
export default function PhotoUpload({ photos, onSave, saving }: PhotoUploadProps) {
  const [items, setItems] = useState<HospitalPhoto[]>(photos);
  const [url, setUrl] = useState('');
  const [caption, setCaption] = useState('');
  const [slot, setSlot] = useState<HospitalPhoto['slot']>('other');
  const [confirmRemove, setConfirmRemove] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  function add() {
    if (!url.trim() || items.length >= 5) return;
    setItems((prev) => [...prev, { url: url.trim(), caption: caption || undefined, slot }]);
    setUrl('');
    setCaption('');
    setSlot('other');
  }

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-picking the same file
    if (!file) return;
    setUploadError(null);
    setUploading(true);
    try {
      setUrl(await uploadFile(file));
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setUploading(false);
    }
  }

  function remove(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index));
    setConfirmRemove(null);
  }

  return (
    <div>
      <ul className={styles.grid}>
        {items.map((p, i) => (
          <li key={p.url + i} className={styles.item}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.url} alt={p.caption ?? ''} />
            <div className={styles.itemMeta}>
              <span>{SLOTS.find((s) => s.value === p.slot)?.label ?? 'Other'}</span>
              <button
                type="button"
                className={styles.removeBtn}
                onClick={() => setConfirmRemove(i)}
                aria-label="Remove photo"
              >
                ✕
              </button>
            </div>
          </li>
        ))}
      </ul>

      {items.length < 5 && (
        <div className={styles.addRow}>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={onPick}
            disabled={uploading}
            aria-label="Upload image file"
          />
          <input
            type="url"
            placeholder={uploading ? 'Uploading…' : 'or paste an image URL'}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            aria-label="Image URL"
          />
          <input
            type="text"
            placeholder="Caption (optional)"
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            aria-label="Caption"
          />
          <select
            value={slot}
            onChange={(e) => setSlot(e.target.value as HospitalPhoto['slot'])}
            aria-label="Photo slot"
          >
            {SLOTS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          <Button variant="ghost" onClick={add} disabled={uploading || !url.trim()}>
            Add
          </Button>
        </div>
      )}

      <ErrorBubble variant="banner" message={uploadError} />

      <div className={styles.saveRow}>
        <Button onClick={() => onSave(items)} disabled={saving}>
          {saving ? 'Saving…' : 'Save photos'}
        </Button>
      </div>

      <Modal
        open={confirmRemove !== null}
        onClose={() => setConfirmRemove(null)}
        title="Remove photo?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmRemove(null)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={() => confirmRemove !== null && remove(confirmRemove)}>
              Remove
            </Button>
          </>
        }
      >
        <p>Remove this photo from the gallery? Save to apply the change.</p>
      </Modal>
    </div>
  );
}
