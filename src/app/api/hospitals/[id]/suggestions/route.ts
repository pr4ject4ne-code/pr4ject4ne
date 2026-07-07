import { cookies } from 'next/headers';
import { query, queryOne } from '@/lib/db';
import { apiError, apiOk, readJson } from '@/lib/api';
import { getSession, DEV_SESSION_COOKIE, checkRateLimit } from '@/lib/auth';
import { clientIpFrom } from '@/lib/audit';
import type { Suggestion, SuggestionCategory } from '@/types';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CATEGORIES: SuggestionCategory[] = [
  'data_correction',
  'photo',
  'hours',
  'personnel',
  'other',
];

interface Body {
  content?: string;
  category?: string;
  email?: string;
}

/** POST — submit a community suggestion for a hospital (public). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!UUID_RE.test((await params).id)) return apiError('Hospital not found.', 'NOT_FOUND', 404);

  const body = await readJson<Body>(req);
  if (!body) return apiError('Invalid request body.', 'BAD_REQUEST', 400);

  const content = typeof body.content === 'string' ? body.content.trim() : '';
  if (!content || content.length > 4000) {
    return apiError('Suggestion content is required.', 'MISSING_CONTENT', 400);
  }

  const ip = clientIpFrom(req.headers) ?? 'unknown';
  const allowed = await checkRateLimit(`suggestion:${ip}`, 20, 3600);
  if (!allowed) return apiError('Too many suggestions. Try again later.', 'RATE_LIMITED', 429);

  const hospital = await queryOne<{ id: string }>(
    `SELECT id FROM hospitals WHERE id = $1 AND status = 'approved'`,
    [(await params).id],
  );
  if (!hospital) return apiError('Hospital not found.', 'NOT_FOUND', 404);

  const category = CATEGORIES.includes(body.category as SuggestionCategory)
    ? (body.category as SuggestionCategory)
    : 'other';
  const email = typeof body.email === 'string' && body.email.length <= 254 ? body.email : null;

  const { rows } = await query<{ id: string }>(
    `INSERT INTO suggestions (hospital_id, submitted_by_email, content, category)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [(await params).id, email, content, category],
  );

  return apiOk({ success: true, id: rows[0]!.id }, 201);
}

/** GET — list suggestions for a hospital (developer only). */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!UUID_RE.test((await params).id)) return apiError('Hospital not found.', 'NOT_FOUND', 404);

  const token = (await cookies()).get(DEV_SESSION_COOKIE)?.value;
  const session = await getSession(token);
  if (!session || session.account_type !== 'developer') {
    return apiError('Forbidden.', 'FORBIDDEN', 403);
  }

  const url = new URL(req.url);
  const status = url.searchParams.get('status');
  const params2: unknown[] = [(await params).id];
  let statusClause = '';
  if (status && ['new', 'reviewed', 'applied', 'dismissed'].includes(status)) {
    params2.push(status);
    statusClause = ` AND status = $${params2.length}`;
  }

  const { rows } = await query<Suggestion>(
    `SELECT * FROM suggestions WHERE hospital_id = $1${statusClause}
     ORDER BY created_at DESC`,
    params2,
  );

  return apiOk({ suggestions: rows });
}
