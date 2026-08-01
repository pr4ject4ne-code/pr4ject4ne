/**
 * Minimal text sanitization for stored free-text fields. We store plain text and
 * escape HTML-significant characters so any later rendering is XSS-safe even if a
 * consumer forgets to escape. React already escapes on render; this is defense in
 * depth for the stored value.
 */
export function sanitizeText(input: unknown, maxLen = 20000): string | null {
  if (typeof input !== 'string') return null;
  const trimmed = input.slice(0, maxLen);
  return trimmed.replace(/[<>]/g, (c) => (c === '<' ? '&lt;' : '&gt;'));
}

/**
 * Validate a user-supplied URL and return it only if it is a plain http(s) URL.
 * Anything else — most importantly `javascript:` and `data:` schemes — returns
 * null. Stored URLs flow into `href`/`src` sinks; React does NOT block a
 * `javascript:` href, so scheme validation is the actual XSS guard here. Apply
 * on write (reject bad values) and again at render (defense in depth).
 */
export function safeHttpUrl(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? trimmed : null;
  } catch {
    return null;
  }
}

/**
 * Sanitize a client-supplied biodata "layer" (a flat map of profile/biodata
 * fields) before it is merged into stored JSON.
 *
 * Returns `null` if the value is not a plain object (a string/array/number would
 * otherwise spread into index-keyed garbage that corrupts the record). Otherwise
 * returns a shallow copy keeping only primitive leaves — strings are HTML-escaped
 * via sanitizeText, numbers/booleans/null pass through, and any nested
 * object/array or over-long value is dropped. Enforces a key cap so a single
 * request can't balloon the stored document.
 */
export function sanitizeLayer(
  input: unknown,
  maxKeys = 60,
  maxValueLen = 4000,
): Record<string, unknown> | null {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return null;
  const out: Record<string, unknown> = {};
  let count = 0;
  for (const [key, value] of Object.entries(input)) {
    if (count >= maxKeys) break;
    if (typeof key !== 'string' || key.length > 200) continue;
    if (typeof value === 'string') {
      const clean = sanitizeText(value, maxValueLen);
      if (clean !== null) out[key] = clean;
    } else if (typeof value === 'number' || typeof value === 'boolean' || value === null) {
      out[key] = value;
    }
    // Nested objects/arrays are intentionally dropped — layers are flat.
    count += 1;
  }
  return out;
}

export interface SanitizedClinicalCondition {
  condition: string;
  cause?: string;
  duration?: string;
  progression?: string;
  complication?: string;
  care?: string;
  timestamp: string;
  doctor_id?: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Sanitize the biodata layer's `clinical_conditions` array. sanitizeLayer drops
 * nested arrays, so this whitelisted structure is validated separately: each
 * entry keeps a required (escaped) condition, optional (escaped) cause/duration/
 * progression/complication/care detail fields, and a server-fixed ISO timestamp —
 * a client-supplied timestamp is honoured only if it parses, otherwise "now".
 * Non-objects and entries without a condition are dropped, and the list is
 * capped. IMPORTANT: any new optional field on this struct must be added to the
 * whitelist below or it will silently vanish on save (this bit the project once
 * already with `cause`/`timestamp`).
 */
export function sanitizeClinicalConditions(
  input: unknown,
  maxItems = 50,
): SanitizedClinicalCondition[] {
  if (!Array.isArray(input)) return [];
  const out: SanitizedClinicalCondition[] = [];
  for (const item of input.slice(0, maxItems)) {
    if (typeof item !== 'object' || item === null) continue;
    const rec = item as Record<string, unknown>;
    const condition = sanitizeText(rec.condition, 200);
    if (!condition || !condition.trim()) continue;
    const cause = sanitizeText(rec.cause, 2000);
    const duration = sanitizeText(rec.duration, 200);
    const progression = sanitizeText(rec.progression, 2000);
    const complication = sanitizeText(rec.complication, 2000);
    const care = sanitizeText(rec.care, 2000);
    const rawTs = rec.timestamp;
    const timestamp =
      typeof rawTs === 'string' && !Number.isNaN(Date.parse(rawTs))
        ? new Date(rawTs).toISOString()
        : new Date().toISOString();
    // doctor_id is a raw UUID reference to `doctors`, not free text — validate
    // shape only (existence is checked, if at all, by whatever reads it), and
    // drop silently rather than store a garbage value that would later be
    // mistaken for a real doctor reference.
    const rawDoctorId = rec.doctor_id;
    const doctorId = typeof rawDoctorId === 'string' && UUID_RE.test(rawDoctorId) ? rawDoctorId : undefined;
    out.push({
      condition,
      ...(cause && cause.trim() ? { cause } : {}),
      ...(duration && duration.trim() ? { duration } : {}),
      ...(progression && progression.trim() ? { progression } : {}),
      ...(complication && complication.trim() ? { complication } : {}),
      ...(care && care.trim() ? { care } : {}),
      timestamp,
      ...(doctorId ? { doctor_id: doctorId } : {}),
    });
  }
  return out;
}

export interface SanitizedDepartment {
  id: string;
  name: string;
  services: string[];
}

const UUID_SHAPE_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Sanitize a client-supplied `departments` array (worklist #14) before it is
 * stored as the hospital's JSONB `departments` column.
 *
 * Shape: `[{ id, name, services: string[] }]`. Each entry is dropped unless
 * it has a non-empty (escaped) `name`; `services` is a flat string list,
 * escaped per-entry, blanks dropped. Caps mirror `sanitizeClinicalConditions`'s
 * scale (a hospital's real department count/service count is small, tens not
 * hundreds) while still comfortably covering a large institution:
 *  - up to 40 departments per hospital
 *  - up to 40 services per department
 *  - department name up to 200 chars, each service up to 200 chars
 * (same per-string cap `specialties` already uses on this same table).
 *
 * `id` is a stable per-department identity (migration 023) that
 * department_ratings.department_id references. The server is the source of
 * truth for "is this id valid," not the client: an incoming `id` is kept
 * ONLY if it is a well-formed UUID-shaped string that ALSO matches an id
 * already present in `existingDepartments` (the hospital's current, stored
 * departments row, passed in by the caller — see
 * `PATCH /api/hospital/[id]/info`). Anything else — missing, malformed, a
 * brand-new department's client-generated id, or a client hand-crafting an
 * arbitrary/previously-seen id it was never actually assigned — gets a fresh
 * server-generated UUID.
 *
 * This closes a ratings-laundering surface: without pinning `id` to the
 * caller's own existing rows, a hospital owner could drop a badly-rated
 * department's id from the payload (diffed as "removed" -> its ratings
 * cascade-delete) while re-adding an entry with the identical display name
 * under a fresh id in the SAME request — the department reappears with a
 * clean slate. Validating `id` here is defense in depth alongside the
 * rename-detection diff logic in the route itself (which also needs
 * `existingDepartments` to tell a genuine removal from a same-name rename).
 */
export function sanitizeDepartments(
  input: unknown,
  existingDepartments: ReadonlyArray<{ id?: string }> = [],
  maxDepartments = 40,
  maxServicesPerDept = 40,
): SanitizedDepartment[] {
  if (!Array.isArray(input)) return [];
  const existingIds = new Set(
    existingDepartments.map((d) => d.id).filter((v): v is string => typeof v === 'string'),
  );
  const out: SanitizedDepartment[] = [];
  for (const item of input.slice(0, maxDepartments)) {
    if (typeof item !== 'object' || item === null) continue;
    const rec = item as Record<string, unknown>;
    const name = sanitizeText(rec.name, 200);
    if (!name || !name.trim()) continue;
    const services = Array.isArray(rec.services)
      ? rec.services
          .filter((s): s is string => typeof s === 'string')
          .map((s) => sanitizeText(s, 200) ?? '')
          .map((s) => s.trim())
          .filter(Boolean)
          .slice(0, maxServicesPerDept)
      : [];
    // Uses the global Web Crypto API (crypto.randomUUID), not `node:crypto` —
    // this module is imported by client components too (see e.g.
    // HospitalInfo.tsx), and `crypto.randomUUID()` is available in both the
    // browser and Node/edge runtimes without an import (same approach as
    // middleware.ts's nonce generation).
    const rawId = typeof rec.id === 'string' && UUID_SHAPE_RE.test(rec.id) ? rec.id : null;
    const id = rawId && existingIds.has(rawId) ? rawId : crypto.randomUUID();
    out.push({ id, name, services });
  }
  return out;
}

/**
 * Escape LIKE/ILIKE metacharacters (`\`, `%`, `_`) in user input so a search
 * term is matched literally, not as a wildcard pattern. Without this, a term of
 * many `%` forces a pathological scan on unindexed columns — a cheap DoS on the
 * public, unauthenticated search endpoints. Pair with `ESCAPE '\'` in the query.
 */
export function escapeLikePattern(input: string): string {
  return input.replace(/[\\%_]/g, (c) => `\\${c}`);
}
