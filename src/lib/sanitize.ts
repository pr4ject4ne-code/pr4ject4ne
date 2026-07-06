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
 * Escape LIKE/ILIKE metacharacters (`\`, `%`, `_`) in user input so a search
 * term is matched literally, not as a wildcard pattern. Without this, a term of
 * many `%` forces a pathological scan on unindexed columns — a cheap DoS on the
 * public, unauthenticated search endpoints. Pair with `ESCAPE '\'` in the query.
 */
export function escapeLikePattern(input: string): string {
  return input.replace(/[\\%_]/g, (c) => `\\${c}`);
}
