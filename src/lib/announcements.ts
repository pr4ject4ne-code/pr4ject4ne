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

export interface AnnouncementAuditRow {
  id: string;
  announcement_id: string;
  action: string;
  actor_id?: string | null;
  actor_ip?: string | null;
  details?: any;
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
}, opts?: { actor_id?: string | null; actor_ip?: string | null }) {
  const { title, body, start_at, end_at, recurrence_rule } = payload;
  return withTransaction(async (tx) => {
    const insertSql = `
      INSERT INTO announcements (title, body, start_at, end_at, recurrence_rule)
      VALUES ($1,$2,$3,$4,$5)
      RETURNING id, title, body, start_at, end_at, recurrence_rule, created_at
    `;
    const res = await tx.query<Announcement>(insertSql, [title, body, start_at, end_at, recurrence_rule]);
    const row = res.rows[0];

    // record audit
    await tx.query(
      `INSERT INTO announcements_audit (announcement_id, action, actor_id, actor_ip, details) VALUES ($1,$2,$3,$4,$5)`,
      [row.id, 'created', opts?.actor_id ?? null, opts?.actor_ip ?? null, { payload }],
    );

    return row;
  });
}

export async function getAnnouncement(id: string): Promise<Announcement | null> {
  return queryOne<Announcement>(`SELECT id,title,body,start_at,end_at,recurrence_rule,created_at FROM announcements WHERE id = $1`, [
    id,
  ]);
}

export async function updateAnnouncement(id: string, updates: Partial<Announcement>, opts?: { actor_id?: string | null; actor_ip?: string | null }) {
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

    // record audit
    await tx.query(
      `INSERT INTO announcements_audit (announcement_id, action, actor_id, actor_ip, details) VALUES ($1,$2,$3,$4,$5)`,
      [id, 'updated', opts?.actor_id ?? null, opts?.actor_ip ?? null, { updates }],
    );

    return updated.rows[0];
  });
}

export async function deleteAnnouncement(id: string, opts?: { actor_id?: string | null; actor_ip?: string | null }) {
  // Enforce both protections:
  // - cannot delete within 3 days AFTER creation
  // - cannot delete within 3 days BEFORE start_at
  return withTransaction(async (tx) => {
    const res = await tx.query<Announcement & { created_at: string }>(`SELECT id, created_at, start_at FROM announcements WHERE id = $1 FOR UPDATE`, [id]);
    const row = res.rows[0] as (Announcement & { created_at: string }) | undefined;
    if (!row) throw new Error('Not found');
    const createdAt = new Date(row.created_at);
    const startAt = new Date(row.start_at);
    const now = new Date();

    const minDeleteAfterCreate = new Date(createdAt.getTime() + 3 * 24 * 60 * 60 * 1000);
    const cutoffBeforeStart = new Date(startAt.getTime() - 3 * 24 * 60 * 60 * 1000);

    if (now < minDeleteAfterCreate) {
      // record blocked attempt
      await tx.query(`INSERT INTO announcements_audit (announcement_id, action, actor_id, actor_ip, details) VALUES ($1,$2,$3,$4,$5)`, [
        id,
        'delete_blocked_recent_creation',
        opts?.actor_id ?? null,
        opts?.actor_ip ?? null,
        { reason: 'within 72 hours after creation', created_at: row.created_at },
      ]);
      throw new Error('Announcements cannot be deleted within 3 days of creation');
    }

    if (now >= cutoffBeforeStart) {
      // within 72 hours before start
      await tx.query(`INSERT INTO announcements_audit (announcement_id, action, actor_id, actor_ip, details) VALUES ($1,$2,$3,$4,$5)`, [
        id,
        'delete_blocked_near_start',
        opts?.actor_id ?? null,
        opts?.actor_ip ?? null,
        { reason: 'within 72 hours before start', start_at: row.start_at },
      ]);
      throw new Error('Announcements cannot be deleted within 3 days before their start date');
    }

    await tx.query(`DELETE FROM announcements WHERE id = $1`, [id]);

    // record successful delete
    await tx.query(`INSERT INTO announcements_audit (announcement_id, action, actor_id, actor_ip, details) VALUES ($1,$2,$3,$4,$5)`, [
      id,
      'deleted',
      opts?.actor_id ?? null,
      opts?.actor_ip ?? null,
      { deleted_at: new Date().toISOString() },
    ]);

    return true;
  });
}

export async function insertAnnouncementAudit(payload: {
  announcement_id: string;
  action: string;
  actor_id?: string | null;
  actor_ip?: string | null;
  details?: any;
}) {
  const { announcement_id, action, actor_id = null, actor_ip = null, details = null } = payload;
  const sql = `INSERT INTO announcements_audit (announcement_id, action, actor_id, actor_ip, details) VALUES ($1,$2,$3,$4,$5) RETURNING id,announcement_id,action,actor_id,actor_ip,details,created_at`;
  const { rows } = await query<AnnouncementAuditRow>(sql, [announcement_id, action, actor_id, actor_ip, details]);
  return rows[0];
}

export async function searchAnnouncementLogs(params: {
  q?: string | null;
  actor?: string | null; // actor id (could extend to email later)
  action?: string | null;
  from?: string | null; // ISO
  to?: string | null; // ISO
  announcement_id?: string | null;
  page?: number;
  pageSize?: number;
}) {
  const { q, actor, action, from, to, announcement_id } = params;
  const page = params.page && params.page > 0 ? params.page : 1;
  const pageSize = params.pageSize && params.pageSize > 0 && params.pageSize <= 200 ? params.pageSize : 50;

  const now = new Date();
  const defaultFrom = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000).toISOString();
  const defaultTo = now.toISOString();

  const fromVal = from ?? defaultFrom;
  const toVal = to ?? defaultTo;

  const conditions: string[] = [];
  const paramsArr: any[] = [fromVal, toVal];
  let idx = 3;

  conditions.push(`a.created_at >= $1 AND a.created_at <= $2`);

  if (action) {
    conditions.push(`a.action = $${idx}`);
    paramsArr.push(action);
    idx++;
  }
  if (actor) {
    conditions.push(`a.actor_id = $${idx}`);
    paramsArr.push(actor);
    idx++;
  }
  if (announcement_id) {
    conditions.push(`a.announcement_id = $${idx}`);
    paramsArr.push(announcement_id);
    idx++;
  }
  if (q) {
    // simple ILIKE match against announcement title/body and audit details text
    conditions.push(`(ann.title ILIKE $${idx} OR ann.body ILIKE $${idx} OR a.details::text ILIKE $${idx})`);
    paramsArr.push(`%${q}%`);
    idx++;
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const offset = (page - 1) * pageSize;

  const sql = `
    SELECT a.id, a.announcement_id, a.action, a.actor_id, a.actor_ip, a.details, a.created_at, ann.title, ann.body
    FROM announcements_audit a
    LEFT JOIN announcements ann ON ann.id = a.announcement_id
    ${where}
    ORDER BY a.created_at DESC
    LIMIT ${pageSize} OFFSET ${offset}
  `;

  const { rows } = await query(sql, paramsArr);
  return rows;
}
