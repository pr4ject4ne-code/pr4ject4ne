import { apiError, apiOk } from '@/lib/api';
import { getDevUser } from '@/lib/dev-auth';
import { getHospitalStaff } from '@/lib/hospital-auth';
import { checkRateLimit } from '@/lib/auth';
import { isStorageConfigured, uploadMedia, extensionForType, isVideoType, MAX_IMAGE_UPLOAD_BYTES, MAX_VIDEO_UPLOAD_BYTES } from '@/lib/storage';
import { logAudit, clientIpFrom } from '@/lib/audit';
import { logger, errMessage } from '@/lib/logger';

// Uploading needs the Node runtime (Buffer + streaming request body).
export const runtime = 'nodejs';

/**
 * POST /api/uploads — accept an image or short video file (multipart
 * form-data, field `file`) and return a public URL. Authenticated uploaders
 * only: developers (first-aid media) and hospital staff (their own media).
 * The returned URL is then saved by the relevant write endpoint (hospital
 * media / first-aid entry), which re-checks it with safeHttpUrl.
 */
export async function POST(req: Request) {
  const dev = await getDevUser();
  const staff = dev ? null : await getHospitalStaff();
  const uploaderId = dev?.id ?? staff?.userId;
  if (!uploaderId) return apiError('Not authenticated.', 'UNAUTHENTICATED', 401);

  if (!isStorageConfigured()) {
    return apiError('File uploads are not configured.', 'STORAGE_UNCONFIGURED', 503);
  }

  const allowed = await checkRateLimit(`upload:${uploaderId}`, 40, 3600);
  if (!allowed) return apiError('Too many uploads. Try again later.', 'RATE_LIMITED', 429);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return apiError('Expected multipart form data.', 'BAD_REQUEST', 400);
  }

  const file = form.get('file');
  if (!(file instanceof File)) return apiError('No file provided.', 'BAD_REQUEST', 400);
  if (file.size === 0) return apiError('Empty file.', 'BAD_REQUEST', 400);
  if (!extensionForType(file.type)) {
    return apiError('Only JPEG, PNG, WebP images or MP4/WebM videos are allowed.', 'UNSUPPORTED_TYPE', 415);
  }
  const cap = isVideoType(file.type) ? MAX_VIDEO_UPLOAD_BYTES : MAX_IMAGE_UPLOAD_BYTES;
  if (file.size > cap) {
    const capMb = Math.round(cap / (1024 * 1024));
    return apiError(`File too large (max ${capMb}MB).`, 'FILE_TOO_LARGE', 413);
  }

  // Namespace by uploader kind; hospital media is further scoped to the hospital.
  const prefix = dev ? 'first-aid' : `hospitals/${staff!.hospitalId}`;
  try {
    const bytes = Buffer.from(await file.arrayBuffer());
    const { url } = await uploadMedia({ bytes, contentType: file.type, prefix });
    await logAudit({
      userId: uploaderId,
      action: dev ? 'first_aid_edit' : 'hospital_update',
      resourceType: 'upload',
      details: { field: isVideoType(file.type) ? 'video' : 'image', bytes: file.size },
      ip: clientIpFrom(req.headers),
    });
    return apiOk({ success: true, url }, 201);
  } catch (err) {
    logger.error('upload_failed', { error: errMessage(err) });
    return apiError('Upload failed. Please try again.', 'UPLOAD_FAILED', 502);
  }
}
