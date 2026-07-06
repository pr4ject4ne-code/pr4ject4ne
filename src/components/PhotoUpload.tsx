'use client';

import { useState } from 'react';
import Button from './Button';
import Modal from './Modal';
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
 * Manage up to 5 hospital photos. TODO: replace URL entry with a real file
 * upload (validate type/size, store to S3/server) once infra is ready.
 */
export default function PhotoUpload({ photos, onSave, saving }: PhotoUploadProps) {
  const [items, setItems] = useState<HospitalPhoto[]>(photos);
  const [url, setUrl] = useState('');
  const [caption, setCaption] = useState('');
  const [slot, setSlot] = useState<HospitalPhoto['slot']>('other');
  const [confirmRemove, setConfirmRemove] = useState<number | null>(null);

  function add() {
    if (!url.trim() || items.length >= 5) return;
    setItems((prev) => [...prev, { url: url.trim(), caption: caption || undefined, slot }]);
    setUrl('');
    setCaption('');
    setSlot('other');
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
              <button type="button" onClick={() => setConfirmRemove(i)} aria-label="Remove photo">
                ✕
              </button>
            </div>
          </li>
        ))}
      </ul>

      {items.length < 5 && (
        <div className={styles.addRow}>
          <input
            type="url"
            placeholder="Image URL"
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
          <Button variant="ghost" onClick={add}>
            Add
          </Button>
        </div>
      )}

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
