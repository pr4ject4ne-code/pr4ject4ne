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

/** Normalize a department name for equality comparisons (trim + lowercase). */
function normalizeDeptName(name: string): string {
  return name.trim().toLowerCase();
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
  const wantsDepartmentsUpdate = Array.isArray(body.departments);
  if (typeof body.is_24_hour === 'boolean') push('is_24_hour', body.is_24_hour);
  if (typeof body.show_doctors === 'boolean') push('show_doctors', body.show_doctors);

  if (sets.length === 0 && !wantsDepartmentsUpdate) {
    return apiError('Nothing to update.', 'BAD_REQUEST', 400);
  }

  // Departments removed with existing ratings, collected inside the
  // transaction below for a post-commit audit-log entry (item 4 — defense in
  // depth, see cascadeDeleteRemovedDepartmentRatings's caller comment).
  const removedWithRatings: { id: string; name: string; count: number }[] = [];

  // Everything below runs in ONE transaction: when `departments` is part of
  // this PATCH, a department that existed before and is missing from the new
  // array has its ratings cascade-deleted (and the hospital aggregate
  // recomputed) in the SAME transaction as the departments column write —
  // both commit or roll back together, never one without the other.
  await withTransaction(async (tx) => {
    let removedDepartmentIds: string[] = [];
    let currentDepartments: HospitalDepartment[] = [];

    if (wantsDepartmentsUpdate) {
      // FOR UPDATE locks the row for the duration of this transaction so a
      // concurrent departments save can't race this diff (TOCTOU). The
      // current row is also the trust-anchor sanitizeDepartments needs: an
      // incoming `id` is only honored if it already exists here.
      const { rows: current } = await tx.query<{ departments: HospitalDepartment[] }>(
        `SELECT departments FROM hospitals WHERE id = $1 FOR UPDATE`,
        [hospitalId],
      );
      currentDepartments = current[0]?.departments ?? [];
      const sanitizedDepartments = sanitizeDepartments(body.departments, currentDepartments);

      const currentIds = new Set(
        currentDepartments.map((d) => d.id).filter((v): v is string => Boolean(v)),
      );
      const nextIds = new Set(sanitizedDepartments.map((d) => d.id));
      const candidateRemovedIds = [...currentIds].filter((id) => !nextIds.has(id));

      // Rename detection: a "removed" department survives if its normalized
      // name reappears on an incoming entry that doesn't already carry a
      // matching existing id (i.e. one of the freshly-minted entries — a
      // genuinely new id can't collide with currentIds since sanitizeDepartments
      // only keeps ids present in currentDepartments). When found, the OLD id
      // is carried forward onto that entry so its rating history survives —
      // this is the fix for the "drop id + resubmit identical name" ratings-
      // laundering exploit. Only a department whose id AND name both fail to
      // survive in the incoming array is a genuine removal eligible for the
      // ratings cascade-delete.
      const removedByName = new Map<string, string>();
      for (const dept of currentDepartments) {
        if (candidateRemovedIds.includes(dept.id)) {
          removedByName.set(normalizeDeptName(dept.name), dept.id);
        }
      }
      const renamedIds = new Set<string>();
      for (const dept of sanitizedDepartments) {
        if (currentIds.has(dept.id)) continue; // already a genuine existing-id match, not a rename target
        const matchId = removedByName.get(normalizeDeptName(dept.name));
        if (matchId) {
          dept.id = matchId;
          renamedIds.add(matchId);
          removedByName.delete(normalizeDeptName(dept.name)); // one old id reused at most once
        }
      }

      removedDepartmentIds = candidateRemovedIds.filter((id) => !renamedIds.has(id));
      push('departments', JSON.stringify(sanitizedDepartments));
    }

    values.push(hospitalId);
    await tx.query(
      `UPDATE hospitals SET ${sets.join(', ')}, updated_at = now() WHERE id = $${values.length}`,
      values,
    );

    if (removedDepartmentIds.length > 0) {
      // Snapshot rating counts for genuinely-removed departments BEFORE the
      // cascade-delete, purely for the audit trail below (item 4).
      const { rows: countRows } = await tx.query<{ department_id: string; count: string }>(
        `SELECT department_id, COUNT(*)::text AS count FROM department_ratings
         WHERE hospital_id = $1 AND department_id = ANY($2::uuid[]) GROUP BY department_id`,
        [hospitalId, removedDepartmentIds],
      );
      const countByDept = new Map(countRows.map((r) => [r.department_id, Number(r.count)]));
      const nameById = new Map(currentDepartments.map((d) => [d.id, d.name]));
      for (const id of removedDepartmentIds) {
        const count = countByDept.get(id) ?? 0;
        if (count > 0) {
          removedWithRatings.push({ id, name: nameById.get(id) ?? '(unknown)', count });
        }
      }

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

  for (const dept of removedWithRatings) {
    await logAudit({
      userId: staff.userId,
      action: 'department_removed_with_ratings',
      resourceType: 'hospital',
      resourceId: hospitalId,
      details: { department_id: dept.id, department_name: dept.name, prior_rating_count: dept.count },
      ip: clientIpFrom(req.headers),
    });
  }

  return apiOk({ success: true });
}
