// src/lib/supabase-server.ts
// Minimal Supabase Storage server helper using the service_role key.
// This file intentionally avoids adding the @supabase/supabase-js dependency so
// it can be used with only the built-in fetch available in Node 20.

type UploadResult = { success: boolean; error?: string };

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET ?? 'media';

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  // Keep this module import-safe even when envs are not set; callers should
  // handle missing configuration gracefully.
}

/**
 * Upload a Buffer/Uint8Array to Supabase Storage under `path`.
 * Returns { success: true } on 200/2xx, otherwise { success: false, error }.
 */
export async function supabaseUpload(path: string, data: Uint8Array | Buffer, contentType = 'application/octet-stream'): Promise<UploadResult> {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return { success: false, error: 'Supabase not configured (SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing)' };
  }

  const url = `${SUPABASE_URL.replace(/\/$/, '')}/storage/v1/object/${encodeURIComponent(SUPABASE_BUCKET)}/${encodeURIComponent(path)}`;

  try {
    const res = await fetch(url, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': contentType,
        'x-upsert': 'false',
      },
      body: data,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => 'no body');
      return { success: false, error: `supabase upload failed ${res.status}: ${text}` };
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: String(err) };
  }
}

/**
 * Return a public URL for an object in the bucket. Assumes the bucket is public,
 * otherwise consumers should request signed URLs via Supabase's signed URL API.
 */
export function supabasePublicUrl(path: string) {
  if (!SUPABASE_URL) return null;
  return `${SUPABASE_URL.replace(/\/$/, '')}/storage/v1/object/public/${encodeURIComponent(SUPABASE_BUCKET)}/${encodeURIComponent(path)}`;
}
