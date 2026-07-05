import { query } from '@/lib/db';
import { apiError, apiOk, readJson } from '@/lib/api';
import { checkRateLimit } from '@/lib/auth';
import { clientIpFrom } from '@/lib/audit';

/**
 * General site feedback ("suggestion tab", present on every page).
 * Stored server-side; routed to SUGGESTIONS_EMAIL by an out-of-band worker.
 * The support email is NEVER exposed to the client, preventing scraping.
 */
interface Body {
  content?: string;
  email?: string;
  page?: string;
}

export async function POST(req: Request) {
  const body = await readJson<Body>(req);
  if (!body) return apiError('Invalid request body.', 'BAD_REQUEST', 400);

  const content = typeof body.content === 'string' ? body.content.trim() : '';
  if (!content || content.length > 4000) {
    return apiError('Please enter your feedback.', 'MISSING_CONTENT', 400);
  }

  const ip = clientIpFrom(req.headers) ?? 'unknown';
  const allowed = await checkRateLimit(`feedback:${ip}`, 20, 3600);
  if (!allowed) return apiError('Too many submissions. Try again later.', 'RATE_LIMITED', 429);

  const email = typeof body.email === 'string' && body.email.length <= 254 ? body.email : null;
  const page = typeof body.page === 'string' ? body.page.slice(0, 200) : null;

  await query(
    `INSERT INTO suggestions (hospital_id, submitted_by_email, content, category)
     VALUES (NULL, $1, $2, 'other')`,
    [email, page ? `[${page}] ${content}` : content],
  );

  return apiOk({ success: true }, 201);
}
