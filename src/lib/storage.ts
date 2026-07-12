import { randomUUID } from 'node:crypto';

/**
 * Object storage for user-uploaded images (hospital photos/logos, first-aid
 * images), backed by Supabase Storage's REST API — no SDK dependency, matching
 * the project's lean stack. Vercel's filesystem is ephemeral, so local-FS is not
 * an option in production.
 *
 * Config (all server-side; the service-role key is a secret, never client-exposed):
 *   SUPABASE_URL              e.g. https://<ref>.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY service-role key (bypasses RLS for server uploads)
 *   SUPABASE_STORAGE_BUCKET   public bucket name (default: 'media')
 *
 * When unset, isStorageConfigured() is false and callers degrade gracefully
 * (the upload endpoint returns 503 rather than crashing).
 */

/** Allowed image MIME types → file extension. */
const ALLOWED_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5 MB

interface StorageConfig {
  base: string;
  key: string;
  bucket: string;
}

function config(): StorageConfig | null {
  const base = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) return null;
  return {
    base: base.replace(/\/+$/, ''),
    key,
    bucket: process.env.SUPABASE_STORAGE_BUCKET ?? 'media',
  };
}

export function isStorageConfigured(): boolean {
  return config() !== null;
}

/** File extension for an allowed image type, or null if the type is unsupported. */
export function extensionForType(contentType: string): string | null {
  return ALLOWED_TYPES[contentType] ?? null;
}

export interface UploadResult {
  url: string;
}

/**
 * Upload image bytes and return a public URL. `prefix` namespaces the object
 * (e.g. 'hospitals', 'first-aid'). Caller must validate size/type first; this
 * re-checks the type as defence in depth.
 */
export async function uploadImage(opts: {
  bytes: Uint8Array | Buffer;
  contentType: string;
  prefix: string;
}): Promise<UploadResult> {
  const cfg = config();
  if (!cfg) throw new Error('storage_not_configured');
  const ext = extensionForType(opts.contentType);
  if (!ext) throw new Error('unsupported_type');

  const safePrefix = opts.prefix.replace(/[^a-z0-9/_-]/gi, '') || 'uploads';
  const objectPath = `${safePrefix}/${randomUUID()}.${ext}`;

  const res = await fetch(`${cfg.base}/storage/v1/object/${cfg.bucket}/${objectPath}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cfg.key}`,
      apikey: cfg.key,
      'Content-Type': opts.contentType,
      'x-upsert': 'true',
      'cache-control': '3600',
    },
    // undici accepts a Uint8Array/Buffer body at runtime, but the fetch lib types
    // don't list it in BodyInit — narrow cast rather than an extra Blob copy.
    body: opts.bytes as unknown as BodyInit,
  });

  if (!res.ok) {
    throw new Error(`upload_failed_${res.status}`);
  }

  return { url: `${cfg.base}/storage/v1/object/public/${cfg.bucket}/${objectPath}` };
}
