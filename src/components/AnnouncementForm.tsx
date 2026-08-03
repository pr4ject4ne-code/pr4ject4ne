'use client';

import { useState } from 'react';
import Input from './Input';
import Dropdown from './Dropdown';
import Button from './Button';
import { useKeyboardSafeFocus } from '@/lib/useKeyboardSafeFocus';
import type { AnnouncementColor } from '@/types';
import styles from './AnnouncementForm.module.css';

export interface AnnouncementFormValues {
  title: string;
  body: string;
  color: AnnouncementColor;
  event_date: string;
  is_bar: boolean;
}

interface AnnouncementFormProps {
  initial?: Partial<AnnouncementFormValues>;
  onSubmit: (values: AnnouncementFormValues) => Promise<void>;
  submitting?: boolean;
}

export default function AnnouncementForm({ initial, onSubmit, submitting }: AnnouncementFormProps) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [body, setBody] = useState(initial?.body ?? '');
  const [color, setColor] = useState<AnnouncementColor>(initial?.color ?? 'green');
  const [eventDate, setEventDate] = useState(initial?.event_date ?? '');
  const [isBar, setIsBar] = useState(initial?.is_bar ?? false);
  const [error, setError] = useState<string | null>(null);
  // Raw <textarea>, so it bypasses Input.tsx's shared mobile-keyboard wiring
  // and needs it applied directly.
  const keyboardSafe = useKeyboardSafeFocus<HTMLTextAreaElement>();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setError('Title is required.');
      return;
    }
    setError(null);
    await onSubmit({ title, body, color, event_date: eventDate, is_bar: isBar });
  }

  return (
    <form onSubmit={submit}>
      <Input label="Title *" value={title} onChange={(e) => setTitle(e.target.value)} error={error ?? undefined} />
      <div className={styles.field}>
        <label htmlFor="ann-body">Details</label>
        <textarea
          id="ann-body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
          {...keyboardSafe}
        />
      </div>
      <Dropdown
        label="Color code"
        options={[
          { value: 'green', label: 'Green (light)' },
          { value: 'yellow', label: 'Yellow (intermediate)' },
          { value: 'red', label: 'Red (urgent)' },
        ]}
        value={color}
        onChange={(e) => setColor(e.target.value as AnnouncementColor)}
      />
      <Input
        label="Date"
        type="date"
        value={eventDate}
        onChange={(e) => setEventDate(e.target.value)}
      />
      <label className={styles.checkbox}>
        <input type="checkbox" checked={isBar} onChange={(e) => setIsBar(e.target.checked)} />
        <span>Show as the announcement bar (only one at a time)</span>
      </label>
      <Button type="submit" disabled={submitting}>
        {submitting ? 'Saving…' : 'Save announcement'}
      </Button>
    </form>
  );
}
