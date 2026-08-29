'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSession } from '@/lib/useSession';
import AnnouncementForm from '@/components/AnnouncementForm';
import styles from './admin.module.css';

interface LogRow {
  id: string;
  announcement_id: string;
  action: string;
  actor_id?: string | null;
  actor_ip?: string | null;
  details?: any;
  created_at: string;
  title?: string | null;
}

interface AnnouncementSummary {
  id: string;
  title: string;
  start_at: string;
  end_at: string;
}

export default function AdminAnnouncementsPage() {
  const { user } = useSession();

  // Audit log state
  const [q, setQ] = useState('');
  const [actor, setActor] = useState('');
  const [action, setAction] = useState('');
  const [announcementId, setAnnouncementId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [allTime, setAllTime] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);
  const [rows, setRows] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Announcements list / editor state
  const [announcements, setAnnouncements] = useState<AnnouncementSummary[]>([]);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<AnnouncementSummary | null>(null);
  const [annLoading, setAnnLoading] = useState(false);

  useEffect(() => {
    // default date range = last 365 days
    if (!allTime && !from && !to) {
      const now = new Date();
      const past = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
      setFrom(past.toISOString().slice(0, 10));
      setTo(now.toISOString().slice(0, 10));
    }
  }, [allTime]);

  useEffect(() => {
    async function loadLogs() {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (q) params.set('q', q);
        if (actor) params.set('actor', actor);
        if (action) params.set('action', action);
        if (!allTime) {
          if (from) params.set('from', new Date(from).toISOString());
          if (to) params.set('to', new Date(new Date(to).getTime() + 24 * 60 * 60 * 1000 - 1).toISOString());
        }
        if (announcementId) params.set('announcement_id', announcementId);
        params.set('page', String(page));
        params.set('pageSize', String(pageSize));

        const res = await fetch(`/api/announcements/logs?${params.toString()}`);
        if (!res.ok) throw new Error(`status ${res.status}`);
        const data = await res.json();
        setRows(data || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    }
    loadLogs();
  }, [q, actor, action, announcementId, from, to, allTime, page, pageSize]);

  async function loadAnnouncements() {
    setAnnLoading(true);
    try {
      const res = await fetch('/api/announcements');
      if (!res.ok) throw new Error(`status ${res.status}`);
      const data = await res.json();
      setAnnouncements(
        (data || []).map((a: any) => ({ id: a.id, title: a.title, start_at: a.start_at, end_at: a.end_at })) as AnnouncementSummary[],
      );
    } catch (err) {
      // show in UI but don't block logs
      console.error('fetch announcements failed', err);
    } finally {
      setAnnLoading(false);
    }
  }

  useEffect(() => {
    loadAnnouncements();
  }, []);

  const csv = useMemo(() => {
    if (!rows || rows.length === 0) return '';
    const headers = ['created_at', 'action', 'announcement_id', 'announcement_title', 'actor_id', 'actor_ip', 'details'];
    const lines = [headers.join(',')];
    for (const r of rows) {
      const detailStr = typeof r.details === 'string' ? JSON.stringify(r.details) : JSON.stringify(r.details ?? {});
      const titleSafe = (r.title ?? '').replace(/\n/g, ' ').replace(/"/g, '""');
      const line = [
        `"${r.created_at}"`,
        `"${(r.action ?? '').replace(/"/g, '""')}"`,
        `"${(r.announcement_id ?? '').replace(/"/g, '""')}"`,
        `"${titleSafe}"`,
        `"${(r.actor_id ?? '').replace(/"/g, '""')}"`,
        `"${(r.actor_ip ?? '').replace(/"/g, '""')}"`,
        `"${detailStr.replace(/"/g, '""')}"`,
      ].join(',');
      lines.push(line);
    }
    return lines.join('\n');
  }, [rows]);

  function downloadCSV() {
    if (!csv) return;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `announcements_audit_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function handleCreateClick() {
    setEditing(null);
    setEditorOpen(true);
  }

  async function handleEditClick(id: string) {
    const ann = announcements.find((a) => a.id === id);
    if (!ann) return;
    setEditing(ann);
    setEditorOpen(true);
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete announcement? This is permanent subject to deletion rules.')) return;
    try {
      const res = await fetch(`/api/announcements/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || `status ${res.status}`);
      }
      // refresh lists and logs
      await loadAnnouncements();
      setPage(1);
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    }
  }

  function closeEditor() {
    setEditorOpen(false);
    setEditing(null);
  }

  async function handleSaved(row: any) {
    // refresh announcements and logs
    await loadAnnouncements();
    setEditorOpen(false);
    setEditing(null);
    setPage(1);
  }

  if (!user || !user.isAdmin) {
    return <div className={styles.container}>Access denied — admin only.</div>;
  }

  return (
    <div className={styles.container}>
      <h1>Announcements — Admin</h1>

      <section className={styles.editor}>
        <div className={styles.editorHeader}>
          <h2>Manage announcements</h2>
          <div>
            <button onClick={handleCreateClick}>Create announcement</button>
          </div>
        </div>

        {annLoading ? (
          <div>Loading announcements…</div>
        ) : (
          <div className={styles.annList}>
            {announcements.length === 0 ? (
              <div>No announcements found</div>
            ) : (
              announcements.map((a) => (
                <div key={a.id} className={styles.annRow}>
                  <div>
                    <strong>{a.title}</strong>
                    <div className={styles.small}>{new Date(a.start_at).toLocaleString()} → {new Date(a.end_at).toLocaleString()}</div>
                  </div>
                  <div className={styles.annActions}>
                    <button onClick={() => handleEditClick(a.id)}>Edit</button>
                    <button onClick={() => handleDelete(a.id)}>Delete</button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {editorOpen && (
          <div className={styles.editorPanel}>
            <AnnouncementForm
              existing={editing ? { id: editing.id, title: editing.title, body: '', start_at: editing.start_at, end_at: editing.end_at } : undefined}
              onSaved={handleSaved}
              onCancel={closeEditor}
            />
          </div>
        )}
      </section>

      <section className={styles.controls}>
        <h2>Audit logs</h2>
        <div className={styles.controlsRow}>
          <input placeholder="Keyword" value={q} onChange={(e) => setQ(e.target.value)} />
          <input placeholder="Actor ID" value={actor} onChange={(e) => setActor(e.target.value)} />
          <select value={action} onChange={(e) => setAction(e.target.value)}>
            <option value="">Any action</option>
            <option value="created">created</option>
            <option value="updated">updated</option>
            <option value="deleted">deleted</option>
            <option value="dismissed">dismissed</option>
            <option value="delete_blocked_recent_creation">delete_blocked_recent_creation</option>
            <option value="delete_blocked_near_start">delete_blocked_near_start</option>
          </select>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} disabled={allTime} />
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} disabled={allTime} />
          <label>
            <input type="checkbox" checked={allTime} onChange={(e) => setAllTime(e.target.checked)} /> All time
          </label>
          <input placeholder="Announcement ID" value={announcementId} onChange={(e) => setAnnouncementId(e.target.value)} />
          <button onClick={() => setPage(1)}>Search</button>
          <button onClick={downloadCSV} disabled={!rows || rows.length === 0}>
            Export CSV
          </button>
        </div>
      </section>

      <section className={styles.results}>
        {loading ? (
          <div>Loading…</div>
        ) : error ? (
          <div className={styles.error}>{error}</div>
        ) : (
          <>
            <div className={styles.tableHead}>
              <div>Time</div>
              <div>Action</div>
              <div>Announcement</div>
              <div>Actor</div>
              <div>IP</div>
              <div>Details</div>
            </div>
            {rows.map((r) => (
              <div key={r.id} className={styles.row}>
                <div>{new Date(r.created_at).toLocaleString()}</div>
                <div>{r.action}</div>
                <div>
                  {r.title ? <strong>{r.title}</strong> : null}
                  <div className={styles.small}>{r.announcement_id}</div>
                </div>
                <div>{r.actor_id}</div>
                <div>{r.actor_ip}</div>
                <div className={styles.small}>{JSON.stringify(r.details ?? {})}</div>
              </div>
            ))}
            <div className={styles.pagination}>
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
                Prev
              </button>
              <span>Page {page}</span>
              <button onClick={() => setPage((p) => p + 1)}>Next</button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
