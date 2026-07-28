'use client';

import { useEffect, useMemo, useState } from 'react';
import Button from './Button';
import Input from './Input';
import styles from './Calendar.module.css';

interface Reminder {
  id: string;
  title: string;
  note: string | null;
  remind_at: string;
  created_at: string;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** Local (browser-timezone) YYYY-MM-DD key for grouping reminders by day. */
function dateKey(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/**
 * Plain month-view calendar (no queue/booking logic for v1) extended with
 * patient-personal reminders (founder ask). Storage + display only — no
 * push/email delivery, no scheduler (see migrations/017_reminders.sql).
 */
export default function Calendar() {
  const [cursor, setCursor] = useState(() => new Date());
  const [selected, setSelected] = useState<number | null>(null);

  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [time, setTime] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch('/api/reminders')
      .then((res) => (res.ok ? res.json() : null))
      .then((body: { reminders: Reminder[] } | null) => {
        if (active) setReminders(body?.reminders ?? []);
      })
      .catch(() => active && setError('Could not load reminders.'))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  const byDay = useMemo(() => {
    const map = new Map<string, Reminder[]>();
    for (const r of reminders) {
      const key = dateKey(new Date(r.remind_at));
      const list = map.get(key) ?? [];
      list.push(r);
      map.set(key, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.remind_at.localeCompare(b.remind_at));
    }
    return map;
  }, [reminders]);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const startWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const label = cursor.toLocaleString('en-US', { month: 'long', year: 'numeric' });
  const today = new Date();
  const isThisMonth = today.getFullYear() === year && today.getMonth() === month;

  const cells: Array<number | null> = [];
  for (let i = 0; i < startWeekday; i += 1) cells.push(null);
  for (let d = 1; d <= daysInMonth; d += 1) cells.push(d);

  const selectedKey = selected !== null ? dateKey(new Date(year, month, selected)) : null;
  const selectedReminders = selectedKey ? (byDay.get(selectedKey) ?? []) : [];

  function selectDay(d: number) {
    setSelected(d);
    setFormError(null);
    setTitle('');
    setNote('');
    setTime('');
  }

  async function addReminder(e: React.FormEvent) {
    e.preventDefault();
    if (selected === null) return;
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setFormError('A title is required.');
      return;
    }
    // No time given -> local midnight for that date, displayed as "All day".
    // A deliberate v1 simplification rather than adding a separate
    // has-time flag to the schema for a founder ask this small.
    const [h, m] = time ? time.split(':').map(Number) : [0, 0];
    const remindAt = new Date(year, month, selected, h ?? 0, m ?? 0);

    setSaving(true);
    setFormError(null);
    try {
      const res = await fetch('/api/reminders', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title: trimmedTitle,
          note: note.trim() || undefined,
          remind_at: remindAt.toISOString(),
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setFormError(body.error ?? 'Could not save reminder.');
        return;
      }
      setReminders((prev) => [...prev, body.reminder as Reminder]);
      setTitle('');
      setNote('');
      setTime('');
    } catch {
      setFormError('Network error. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  async function deleteReminder(id: string) {
    const prev = reminders;
    setReminders((r) => r.filter((x) => x.id !== id));
    const res = await fetch(`/api/reminders/${id}`, { method: 'DELETE' });
    if (!res.ok) setReminders(prev); // revert on failure
  }

  return (
    <div className={styles.cal}>
      <div className={styles.head}>
        <button
          type="button"
          onClick={() => setCursor(new Date(year, month - 1, 1))}
          aria-label="Previous month"
        >
          ‹
        </button>
        <h3 className={styles.label}>{label}</h3>
        <button
          type="button"
          onClick={() => setCursor(new Date(year, month + 1, 1))}
          aria-label="Next month"
        >
          ›
        </button>
      </div>
      <div className={styles.grid} role="grid" aria-label={`Calendar for ${label}`}>
        {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d) => (
          <div key={d} className={styles.weekday} role="columnheader">
            {d}
          </div>
        ))}
        {cells.map((d, i) =>
          d === null ? (
            <div key={`e${i}`} className={styles.empty} />
          ) : (
            <button
              key={d}
              type="button"
              role="gridcell"
              className={`${styles.day} ${selected === d ? styles.selected : ''} ${
                isThisMonth && today.getDate() === d ? styles.today : ''
              }`}
              onClick={() => selectDay(d)}
            >
              {d}
              {byDay.has(dateKey(new Date(year, month, d))) && (
                <span className={styles.marker} aria-hidden="true" />
              )}
            </button>
          ),
        )}
      </div>

      {error && <p className={styles.muted}>{error}</p>}
      {loading && <p className={styles.muted}>Loading reminders…</p>}

      {selected !== null && !loading && (
        <div className={styles.dayPanel}>
          <h4 className={styles.dayPanelTitle}>
            {new Date(year, month, selected).toLocaleDateString('en-US', {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
            })}
          </h4>

          {selectedReminders.length > 0 ? (
            <ul className={styles.reminderList}>
              {selectedReminders.map((r) => {
                const t = new Date(r.remind_at);
                const isAllDay = t.getHours() === 0 && t.getMinutes() === 0;
                return (
                  <li key={r.id} className={styles.reminderItem}>
                    <div className={styles.reminderBody}>
                      <span className={styles.reminderTime}>
                        {isAllDay
                          ? 'All day'
                          : t.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                      </span>
                      <span className={styles.reminderTitle}>{r.title}</span>
                      {r.note && <p className={styles.reminderNote}>{r.note}</p>}
                    </div>
                    <Button
                      type="button"
                      variant="danger"
                      className={styles.removeBtn}
                      onClick={() => deleteReminder(r.id)}
                      aria-label={`Delete reminder: ${r.title}`}
                    >
                      Delete
                    </Button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className={styles.muted}>No reminders for this date.</p>
          )}

          <form onSubmit={addReminder} className={styles.reminderForm}>
            <Input
              label="Title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
            />
            <Input
              label="Time (optional)"
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
            />
            <Input
              label="Note (optional)"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={2000}
            />
            {formError && <p className={styles.formError}>{formError}</p>}
            <Button type="submit" disabled={saving}>
              {saving ? 'Adding…' : 'Add reminder'}
            </Button>
          </form>
        </div>
      )}
    </div>
  );
}
