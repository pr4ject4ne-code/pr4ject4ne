import { query } from '@/lib/db';
import { apiError, apiOk, readJson } from '@/lib/api';
import { getDevUser } from '@/lib/dev-auth';
import { checkRateLimit } from '@/lib/auth';
import { sanitizeText, safeHttpUrl } from '@/lib/sanitize';
import { logAudit, clientIpFrom } from '@/lib/audit';
import type { FirstAidCategory } from '@/types';

const CATEGORIES: FirstAidCategory[] = ['procedure', 'technique'];
const TEXT_FIELDS = [
  'definition',
  'description',
  'process',
  'dos',
  'donts',
  'things_to_look_out_for',
  'implications',
  'indication',
  'contraindications',
] as const;

/** POST /api/first-aid/entries/create — developer only. */
export async function POST(req: Request) {
  const dev = await getDevUser();
  if (!dev) return apiError('Forbidden.', 'FORBIDDEN', 403);

  // Anti-spam: max 10 uploads per dev per hour.
  const allowed = await checkRateLimit(`first_aid_upload:${dev.id}`, 10, 3600);
  if (!allowed) return apiError('Upload limit reached. Try again later.', 'RATE_LIMITED', 429);

  const body = await readJson<Record<string, unknown>>(req);
  if (!body) return apiError('Invalid request body.', 'BAD_REQUEST', 400);

  const title = sanitizeText(body.title, 300);
  if (!title || !title.trim()) return apiError('Title is required.', 'MISSING_TITLE', 400);

  const category = CATEGORIES.includes(body.category as FirstAidCategory)
    ? (body.category as FirstAidCategory)
    : null;
  if (!category)
    return apiError('Category must be procedure or technique.', 'INVALID_CATEGORY', 400);

  const values: Record<string, string | null> = {};
  for (const f of TEXT_FIELDS) values[f] = sanitizeText(body[f]);

  // TODO: image storage deferred — accept URLs the dev supplies (local FS in dev).
  // Validate scheme so a javascript:/data: URL can't reach the <img src> sink.
  const images = Array.isArray(body.images)
    ? body.images.map((u) => safeHttpUrl(u)).filter((u): u is string => Boolean(u)).slice(0, 10)
    : [];

  const { rows } = await query<{ id: string }>(
    `INSERT INTO first_aid_entries
       (category, title, definition, description, process, dos, donts,
        things_to_look_out_for, implications, indication, contraindications,
        images, created_by_dev_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13)
     RETURNING id`,
    [
      category,
      title,
      values.definition,
      values.description,
      values.process,
      values.dos,
      values.donts,
      values.things_to_look_out_for,
      values.implications,
      values.indication,
      values.contraindications,
      JSON.stringify(images),
      dev.id,
    ],
  );

  const id = rows[0]!.id;
  await logAudit({
    userId: dev.id,
    action: 'first_aid_upload',
    resourceType: 'first_aid_entry',
    resourceId: id,
    details: { title, category },
    ip: clientIpFrom(req.headers),
  });

  return apiOk({ success: true, id }, 201);
}
