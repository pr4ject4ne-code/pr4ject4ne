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

/**
 * Escape LIKE/ILIKE metacharacters (`\`, `%`, `_`) in user input so a search
 * term is matched literally, not as a wildcard pattern. Without this, a term of
 * many `%` forces a pathological scan on unindexed columns — a cheap DoS on the
 * public, unauthenticated search endpoints. Pair with `ESCAPE '\'` in the query.
 */
export function escapeLikePattern(input: string): string {
  return input.replace(/[\\%_]/g, (c) => `\\${c}`);
}
