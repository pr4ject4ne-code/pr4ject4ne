import { withTransaction } from '@/lib/db';
import { apiError, apiOk, readJson } from '@/lib/api';
import { requireHospitalOwnership } from '@/lib/hospital-auth';
import { sanitizeText, safeHttpUrl, sanitizeDepartments } from '@/lib/sanitize';
import { cascadeDeleteRemovedDepartmentRatings } from '@/lib/department-ratings';
import type { HospitalDepartment } from '@/types';
import { logAudit, clientIpFrom } from '@/lib/audit';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface Body {
  name?: string;
  address?: string;
  city?: string;
  latitude?: number | null;
  longitude?: number | null;
  website?: string;
  contact_phone?: string;
  contact_email?: string;
  specialties?: string[];
  departments?: HospitalDepartment[];
  is_24_hour?: boolean;
  show_doctors?: boolean;
}

/** PATCH — edit hospital info (own hospital only). */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const hospitalId = (await params).id;
  if (!UUID_RE.test(hospitalId)) return apiError('Not found.', 'NOT_FOUND', 404);
  const staff = await requireHospitalOwnership(hospitalId);
  if (!staff) return apiError('Forbidden.', 'FORBIDDEN', 403);

  const body = await readJson<Body>(req);
  if (!body) return apiError('Invalid request body.', 'BAD_REQUEST', 400);

  const sets: string[] = [];
  const cols: string[] = [];
  const values: unknown[] = [];
  const push = (col: string, val: unknown, cast = '') => {
    values.push(val);
    cols.push(col);
    sets.push(`${col} = $${values.length}${cast}`);
  };

  if (typeof body.name === 'string') {
    const name = sanitizeText(body.name, 300);
    if (name && name.trim()) push('name', name);
  }
  if ('address' in body) push('address', sanitizeText(body.address, 500));
  if ('city' in body) push('city', sanitizeText(body.city, 200));
  if ('latitude' in body) {
    const lat = body.latitude;
    push('latitude', typeof lat === 'number' && Number.isFinite(lat) && lat >= -90 && lat <= 90 ? lat : null);
  }
  if ('longitude' in body) {
    const lng = body.longitude;
    push(
      'longitude',
      typeof lng === 'number' && Number.isFinite(lng) && lng >= -180 && lng <= 180 ? lng : null,
    );
  }
  if ('website' in body) push('website', safeHttpUrl(body.website));
  if ('contact_phone' in body) push('contact_phone', sanitizeText(body.contact_phone, 100));
  if ('contact_email' in body) push('contact_email', sanitizeText(body.contact_email, 254));
  if (Array.isArray(body.specialties)) {
    const specs = body.specialties.filter((s): s is string => typeof s === 'string').slice(0, 50);
    push('specialties', specs);
  }
  let sanitizedDepartments: HospitalDepartment[] | null = null;
  if (Array.isArray(body.departments)) {
    sanitizedDepartments = sanitizeDepartments(body.departments);
    push('departments', JSON.stringify(sanitizedDepartments));
  }
  if (typeof body.is_24_hour === 'boolean') push('is_24_hour', body.is_24_hour);
  if (typeof body.show_doctors === 'boolean') push('show_doctors', body.show_doctors);

  if (sets.length === 0) return apiError('Nothing to update.', 'BAD_REQUEST', 400);

  // Everything below runs in ONE transaction: when `departments` is part of
  // this PATCH, a department that existed before and is missing from the new
  // array has its ratings cascade-deleted (and the hospital aggregate
  // recomputed) in the SAME transaction as the departments column write —
  // both commit or roll back together, never one without the other.
  await withTransaction(async (tx) => {
    let removedDepartmentIds: string[] = [];
    if (sanitizedDepartments) {
      // FOR UPDATE locks the row for the duration of this transaction so a
      // concurrent departments save can't race this diff (TOCTOU).
      const { rows: current } = await tx.query<{ departments: HospitalDepartment[] }>(
        `SELECT departments FROM hospitals WHERE id = $1 FOR UPDATE`,
        [hospitalId],
      );
      const currentIds = new Set(
        (current[0]?.departments ?? []).map((d) => d.id).filter((v): v is string => Boolean(v)),
      );
      const nextIds = new Set(sanitizedDepartments.map((d) => d.id));
      removedDepartmentIds = [...currentIds].filter((id) => !nextIds.has(id));
    }

    values.push(hospitalId);
    await tx.query(
      `UPDATE hospitals SET ${sets.join(', ')}, updated_at = now() WHERE id = $${values.length}`,
      values,
    );

    if (removedDepartmentIds.length > 0) {
      await cascadeDeleteRemovedDepartmentRatings(hospitalId, removedDepartmentIds, tx);
    }
  });

  await logAudit({
    userId: staff.userId,
    action: 'hospital_update',
    resourceType: 'hospital',
    resourceId: hospitalId,
    details: { fields: cols },
    ip: clientIpFrom(req.headers),
  });

  return apiOk({ success: true });
}
