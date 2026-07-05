'use client';

import { useCallback, useEffect, useState } from 'react';
import DevShell from '../DevShell';
import { useDevGuard } from '../useDevGuard';
import FirstAidForm, { type FirstAidFormValues } from '@/components/FirstAidForm';
import Button from '@/components/Button';
import Modal from '@/components/Modal';
import type { FirstAidEntry } from '@/types';
import styles from './DevFirstAid.module.css';

export default function DevFirstAidClient() {
  const { loading: guardLoading, dev } = useDevGuard();
  const [entries, setEntries] = useState<FirstAidEntry[]>([]);
  const [devId, setDevId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [editing, setEditing] = useState<FirstAidEntry | 'new' | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<FirstAidEntry | null>(null);

  const load = useCallback(async () => {
    const res = await fetch('/api/dev/first-aid');
    if (!res.ok) return;
    const data = await res.json();
    setEntries(data.entries ?? []);
    setDevId(data.dev_id ?? null);
    setIsAdmin(data.is_admin ?? false);
  }, []);

  useEffect(() => {
    if (!guardLoading && dev) load();
  }, [guardLoading, dev, load]);

  async function save(values: FirstAidFormValues) {
    setSubmitting(true);
    setError(null);
    try {
      const isNew = editing === 'new';
      const url = isNew
        ? '/api/first-aid/entries/create'
        : `/api/first-aid/entries/${(editing as FirstAidEntry).id}`;
      const res = await fetch(url, {
        method: isNew ? 'POST' : 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(values),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Save failed.');
        return;
      }
      setEditing(null);
      load();
    } catch {
      setError('Network error.');
    } finally {
      setSubmitting(false);
    }
  }

  async function doDelete(entry: FirstAidEntry) {
    await fetch(`/api/first-aid/entries/${entry.id}`, { method: 'DELETE' });
    setConfirmDelete(null);
    load();
  }

  if (guardLoading) {
    return (
      <DevShell title="First Aid" showNav={false}>
        <p>Loading…</p>
      </DevShell>
    );
  }

  if (editing) {
    return (
      <DevShell title={editing === 'new' ? 'New entry' : 'Edit entry'}>
        <Button variant="ghost" onClick={() => setEditing(null)}>
          ← Back to list
        </Button>
        <div style={{ marginTop: '1rem' }}>
          <FirstAidForm
            entry={editing === 'new' ? undefined : editing}
            onSubmit={save}
            submitting={submitting}
            error={error}
          />
        </div>
      </DevShell>
    );
  }

  return (
    <DevShell title="First Aid entries">
      <div className={styles.top}>
        <Button onClick={() => setEditing('new')}>New entry</Button>
      </div>
      {entries.length === 0 ? (
        <p style={{ color: 'var(--color-muted)' }}>No entries yet.</p>
      ) : (
        <ul className={styles.list}>
          {entries.map((e) => {
            const canEdit = isAdmin || e.created_by_dev_id === devId;
            return (
              <li key={e.id} className={styles.row}>
                <div>
                  <span className={styles.category}>{e.category}</span>
                  <strong>{e.title}</strong>
                </div>
                <div className={styles.actions}>
                  {canEdit ? (
                    <>
                      <Button variant="ghost" onClick={() => setEditing(e)}>
                        Edit
                      </Button>
                      <Button variant="danger" onClick={() => setConfirmDelete(e)}>
                        Delete
                      </Button>
                    </>
                  ) : (
                    <span className={styles.readonly}>Read only</span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Modal
        open={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        title="Delete entry?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDelete(null)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={() => confirmDelete && doDelete(confirmDelete)}>
              Delete
            </Button>
          </>
        }
      >
        <p>Delete “{confirmDelete?.title}”? This cannot be undone.</p>
      </Modal>
    </DevShell>
  );
}
