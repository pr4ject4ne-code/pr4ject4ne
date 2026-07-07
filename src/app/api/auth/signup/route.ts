import { cookies } from 'next/headers';
import { withTransaction } from '@/lib/db';
import {
  hashPassword,
  isValidEmail,
  validatePasswordStrength,
  createSession,
  sessionCookieOptions,
  SESSION_COOKIE,
  findUserByEmail,
} from '@/lib/auth';
import { generateIhnCode } from '@/lib/ihn-code';
import { apiError, apiOk, readJson } from '@/lib/api';
import { logAudit, clientIpFrom } from '@/lib/audit';

interface Body {
  email?: string;
  password?: string;
}

export async function POST(req: Request) {
  const body = await readJson<Body>(req);
  if (!body) return apiError('Invalid request body.', 'BAD_REQUEST', 400);

  const email = typeof body.email === 'string' ? body.email.trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';

  if (!isValidEmail(email)) return apiError('Invalid email address.', 'INVALID_EMAIL', 400);
  const strength = validatePasswordStrength(password);
  if (!strength.ok) return apiError(strength.reason!, 'WEAK_PASSWORD', 400);

  const existing = await findUserByEmail(email);
  if (existing) return apiError('Email already registered.', 'EMAIL_EXISTS', 409);

  const passwordHash = await hashPassword(password);

  // Create user + empty biodata + IHN code atomically. Retry on the very rare
  // IHN collision.
  let userId = '';
  let ihnCode = '';
  for (let attempt = 0; attempt < 5; attempt += 1) {
    ihnCode = generateIhnCode();
    try {
      userId = await withTransaction(async (tx) => {
        const { rows } = await tx.query<{ id: string }>(
          `INSERT INTO users (email, password_hash, account_type)
           VALUES ($1, $2, 'patient') RETURNING id`,
          [email, passwordHash],
        );
        const id = rows[0]!.id;
        await tx.query(
          `INSERT INTO biodata (user_id, profile_layer, biodata_layer, ihn_code)
           VALUES ($1, $2::jsonb, $3::jsonb, $4)`,
          [id, JSON.stringify({ email }), '{}', ihnCode],
        );
        return id;
      });
      break;
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      // Unique violation on ihn_code -> retry with a new code.
      if (message.includes('biodata_ihn_code_key') || message.includes('idx_biodata_ihn')) {
        continue;
      }
      // Unique violation on email (race) -> conflict.
      if (message.includes('users_email_key')) {
        return apiError('Email already registered.', 'EMAIL_EXISTS', 409);
      }
      console.error('signup_failed', message);
      return apiError('Could not create account.', 'SIGNUP_FAILED', 500);
    }
  }

  if (!userId) return apiError('Could not create account.', 'SIGNUP_FAILED', 500);

  const { token, expiresAt } = await createSession(userId, 'patient');
  (await cookies()).set(SESSION_COOKIE, token, sessionCookieOptions(expiresAt));

  await logAudit({
    userId,
    action: 'login',
    resourceType: 'user',
    resourceId: userId,
    details: { via: 'signup' },
    ip: clientIpFrom(req.headers),
  });

  return apiOk({ success: true, ihn_code: ihnCode, user_id: userId }, 201);
}
