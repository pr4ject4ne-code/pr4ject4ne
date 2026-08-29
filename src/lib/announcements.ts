import { query, queryOne, withTransaction } from './db';

export interface Announcement {
  id: string;
  title: string;
  body: string;
  start_at: string; // ISO
  end_at: string; // ISO
  recurrence_rule?: string | null;
  created_at: string;
}

export async function getHeadlineAnnouncements(): Promise<Announcement[]> {
  // Headline window: start_at - 14 days  -> start_at + 7 days
  const sql = `
    SELECT id, title, body, start_at, end_at, recurrence_rule, created_at
    FROM announcements
    WHERE (
      now() >= (start_at - INTERVAL '14 days')
      AND now() <= (start_at + INTERVAL '7 days')
    )
    ORDER BY start_at DESC
    LIMIT 20
  `;
  const { rows } = await query<Announcement>(sql);
  return rows;
}

export async function listAnnouncements(): Promise<Announcement[]> {
  const { rows } = await query<Announcement>(
    `SELECT id,title,body,start_at,end_at,recurrence_rule,created_at FROM announcements ORDER BY start_at DESC`,
  );
  return rows;
}

export async function createAnnouncement(payload: {
  title: string;
  body: string;
  start_at: string;
  end_at: string;
  recurrence_rule?: string | null;
}) {
  const { title, body, start_at, end_at, recurrence_rule } = payload;
  const sql = `
    INSERT INTO announcements (title, body, start_at, end_at, recurrence_rule)
    VALUES ($1,$2,$3,$4,$5)
    RETURNING id, title, body, start_at, end_at, recurrence_rule, created_at
  `;
  const { rows } = await query<Announcement>(sql, [title, body, start_at, end_at, recurrence_rule]);
  return rows[0];
}

export async function getAnnouncement(id: string): Promise<Announcement | null> {
  return queryOne<Announcement>(`SELECT id,title,body,start_at,end_at,recurrence_rule,created_at FROM announcements WHERE id = $1`, [
    id,
  ]);
}

export async function updateAnnouncement(id: string, updates: Partial<Announcement>) {
  // Only allow editing before start_at (announcement date)
  // We'll fetch current row, check created_at/start_at
  return withTransaction(async (tx) => {
    const res = await tx.query<Announcement>(`SELECT * FROM announcements WHERE id = $1 FOR UPDATE`, [id]);
    const row = res.rows[0] as Announcement | undefined;
    if (!row) throw new Error('Not found');
    const now = new Date();
    const startAt = new Date(row.start_at);
    if (now >= startAt) {
      throw new Error('Cannot modify announcement after its start date');
    }
    const fields: string[] = [];
    const params: any[] = [];
    let idx = 1;
    if (updates.title) {
      fields.push(`title = $${idx++}`);
      params.push(updates.title);
    }
    if (updates.body) {
      fields.push(`body = $${idx++}`);
      params.push(updates.body);
    }
    if (updates.start_at) {
      fields.push(`start_at = $${idx++}`);
      params.push(updates.start_at);
    }
    if (updates.end_at) {
      fields.push(`end_at = $${idx++}`);
      params.push(updates.end_at);
    }
    if (Object.prototype.hasOwnProperty.call(updates, 'recurrence_rule')) {
      fields.push(`recurrence_rule = $${idx++}`);
      params.push((updates as any).recurrence_rule ?? null);
    }
    if (fields.length === 0) return row;
    params.push(id);
    const updSql = `UPDATE announcements SET ${fields.join(', ')} WHERE id = $${idx} RETURNING id,title,body,start_at,end_at,recurrence_rule,created_at`;
    const updated = await tx.query<Announcement>(updSql, params);
    return updated.rows[0];
  });
}

export async function deleteAnnouncement(id: string) {
  // Cannot delete within 3 days of creation
  return withTransaction(async (tx) => {
    const res = await tx.query<Announcement>(`SELECT id, created_at FROM announcements WHERE id = $1 FOR UPDATE`, [id]);
    const row = res.rows[0] as Announcement | undefined;
    if (!row) throw new Error('Not found');
    const createdAt = new Date(row.created_at);
    const now = new Date();
    const minDelete = new Date(createdAt.getTime() + 3 * 24 * 60 * 60 * 1000);
    if (now < minDelete) {
      throw new Error('Announcements cannot be deleted within 3 days of creation');
    }
    await tx.query(`DELETE FROM announcements WHERE id = $1`, [id]);
    return true;
  });
}
