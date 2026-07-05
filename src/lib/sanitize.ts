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
