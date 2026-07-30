'use client';

import { useCallback, useEffect, useState } from 'react';
import Card from './Card';
import Button from './Button';
import styles from './AccessLogPanel.module.css';

const PAGE_SIZE = 20;

export type AccessLogOutcome = 'granted' | 'wrong_code' | 'blocked';

export interface AccessLogEntry {
  id: string;
  created_at: string;
  requester: string;
  outcome: AccessLogOutcome;
  fields_returned: string[];
}

interface AccessLogResponse {
  entries: AccessLogEntry[];
  total: number;
}

const OUTCOME_LABEL: Record<AccessLogOutcome, string> = {
  granted: 'Granted',
  wrong_code: 'Wrong code',
  blocked: 'Blocked',
};

function outcomeClass(outcome: AccessLogOutcome): string {
  return outcome === 'granted' ? `${styles.outcomeGranted}` : `${styles.outcomeWarn}`;
}

function formatTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

/**
 * Planner Fix #2 — a patient-facing view of who has redeemed their IHN
 * emergency-access code and when. Reads GET /api/biodata/access-log, which is
 * strictly scoped to the caller's own session (no id ever passed from here).
 * Both granted reads AND wrong-code/blocked attempts are shown, labeled by
 * outcome — a founder decision: failed attempts are the early-warning signal
 * for someone probing the code, not noise to hide. Raw IP is never fetched or
 * shown here (dev-only surface, see /api/dev/audit-logs).
 */
export default function AccessLogPanel() {
  const [entries, setEntries] = useState<AccessLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (nextOffset: number, append: boolean) => {
    if (append) setLoadingMore(true);
    else setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/biodata/access-log?limit=${PAGE_SIZE}&offset=${nextOffset}`);
      if (!res.ok) {
        setError('Could not load your access log.');
        return;
      }
      const body: AccessLogResponse = await res.json();
      setTotal(body.total);
      setEntries((prev) => (append ? [...prev, ...body.entries] : body.entries));
    } catch {
      setError('Network error. Please try again.');
    } finally {
      if (append) setLoadingMore(false);
      else setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(0, false);
  }, [load]);

  const canLoadMore = entries.length < total;

  return (
    <Card variant="plain" as="section" className={styles.card}>
      <h2 className={styles.title}>Who has accessed your biodata</h2>
      <p className={styles.intro}>
        Every time your IHN code is used to look up your biodata — successfully or not — it shows
        up here, newest first.
      </p>

      {loading && <p className={styles.muted}>Loading…</p>}
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      {!loading && !error && entries.length === 0 && (
        <p className={styles.muted}>No one has used your IHN code yet.</p>
      )}

      {entries.length > 0 && (
        <ul className={styles.list}>
          {entries.map((entry) => (
            <li key={entry.id} className={styles.row}>
              <div className={styles.rowHead}>
                <span className={styles.timestamp}>{formatTimestamp(entry.created_at)}</span>
                <span className={`${styles.outcome} ${outcomeClass(entry.outcome)}`}>
                  {OUTCOME_LABEL[entry.outcome]}
                </span>
              </div>
              <p className={styles.requester}>{entry.requester}</p>
              {entry.fields_returned.length > 0 && (
                <div className={styles.fields}>
                  {entry.fields_returned.map((field) => (
                    <span key={field} className={styles.fieldBadge}>
                      {field}
                    </span>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {canLoadMore && (
        <div className={styles.more}>
          <Button
            type="button"
            variant="ghost"
            disabled={loadingMore}
            onClick={() => {
              const next = offset + PAGE_SIZE;
              setOffset(next);
              load(next, true);
            }}
          >
            {loadingMore ? 'Loading…' : 'Load more'}
          </Button>
        </div>
      )}
    </Card>
  );
}
