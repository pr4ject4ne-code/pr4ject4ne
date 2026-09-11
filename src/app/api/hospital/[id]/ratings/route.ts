import { requireHospitalOwnership } from '@/lib/hospital-auth';
import { apiError, apiOk } from '@/lib/api';
import { query } from '@/lib/db';

/**
 * GET /api/hospital/[id]/ratings — a hospital's own individual rating rows
 * (both general and in-depth/department), own hospital only. Distinct from
 * the public GET /api/hospitals/[id], which only ever returns AGGREGATES —
 * staff need the individual rows (with their ids) so they can pick a
 * specific one to dispute (item 8, POST /api/hospital/[id]/rating-disputes).
 * Each row's `dispute_status` reflects any dispute already filed against it
 * (null = none filed) so the UI doesn't offer to dispute something twice.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const staff = await requireHospitalOwnership(id);
  if (!staff) return apiError('Forbidden.', 'FORBIDDEN', 403);

  const [generalRows, departmentRows] = await Promise.all([
    query(
      `SELECT g.id, g.score, g.review, g.created_at,
              rd.status AS dispute_status
       FROM general_ratings g
       LEFT JOIN rating_disputes rd ON rd.general_rating_id = g.id AND rd.status = 'pending'
       WHERE g.hospital_id = $1
       ORDER BY g.created_at DESC`,
      [id],
    ),
    query(
      `SELECT d.id, d.department_id,
              (SELECT elem ->> 'name' FROM jsonb_array_elements(h.departments) elem
                WHERE elem ->> 'id' = d.department_id::text LIMIT 1) AS department_name,
              d.staff_score, d.service_score, d.infrastructure_score, d.review, d.created_at,
              rd.status AS dispute_status
       FROM department_ratings d
       JOIN hospitals h ON h.id = d.hospital_id
       LEFT JOIN rating_disputes rd ON rd.department_rating_id = d.id AND rd.status = 'pending'
       WHERE d.hospital_id = $1
       ORDER BY d.created_at DESC`,
      [id],
    ),
  ]);

  return apiOk({ general: generalRows.rows, department: departmentRows.rows });
}
