'use client';

import { useEffect, useState } from 'react';
import type { Suggestion, SuggestionStatus } from '@/types';
import styles from './SuggestionsBoard.module.css';

type SuggestionRow = Suggestion & { hospital_name?: string | null };

const STATUSES: SuggestionStatus[] = ['new', 'reviewed', 'applied', 'dismissed'];

export default function SuggestionsBoard() {
  const [rows, setRows] = useState<SuggestionRow[]>([]);
  const [filter, setFilter] = useState<SuggestionStatus | ''>('');
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const qs = filter ? `?status=${filter}` : '';
    const res = await fetch(`/api/dev/suggestions${qs}`);
    const data = res.ok ? await res.json() : { suggestions: [] };
    setRows(data.suggestions ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  async function updateStatus(id: string, status: SuggestionStatus) {
    await fetch('/api/dev/suggestions', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id, status }),
    });
    load();
  }

  return (
    <div>
      <div className={styles.filters}>
        <label>
          Filter:{' '}
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as SuggestionStatus | '')}
          >
            <option value="">All</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
      </div>
      {loading ? (
        <p>Loading…</p>
      ) : rows.length === 0 ? (
        <p className={styles.empty}>No suggestions.</p>
      ) : (
        <ul className={styles.list}>
          {rows.map((s) => (
            <li key={s.id} className={styles.item}>
              <div className={styles.meta}>
                <span className={styles.status} data-status={s.status}>
                  {s.status}
                </span>
                {s.hospital_name && <span className={styles.hospital}>{s.hospital_name}</span>}
                <span className={styles.category}>{s.category}</span>
              </div>
              <p className={styles.content}>{s.content}</p>
              {s.submitted_by_email && <p className={styles.email}>{s.submitted_by_email}</p>}
              <div className={styles.actions}>
                {STATUSES.filter((st) => st !== s.status).map((st) => (
                  <button key={st} type="button" onClick={() => updateStatus(s.id, st)}>
                    Mark {st}
                  </button>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
