import { sanitizeText, safeHttpUrl, escapeLikePattern } from '@/lib/sanitize';

describe('sanitizeText', () => {
  it('escapes angle brackets', () => {
    expect(sanitizeText('<script>alert(1)</script>')).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
  });
  it('returns null for non-strings', () => {
    expect(sanitizeText(undefined)).toBeNull();
    expect(sanitizeText(42)).toBeNull();
  });
  it('truncates to max length', () => {
    expect(sanitizeText('abcdef', 3)).toBe('abc');
  });
  it('passes through safe text unchanged', () => {
    expect(sanitizeText('Apply pressure to the wound.')).toBe('Apply pressure to the wound.');
  });
});

describe('safeHttpUrl', () => {
  it.each([
    'http://example.com',
    'https://example.com/path?q=1',
    'https://sub.domain.io/a/b',
  ])('accepts http(s) URL %s', (url) => {
    expect(safeHttpUrl(url)).toBe(url);
  });

  it.each([
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox(1)',
    'ftp://example.com/file',
    '',
    '   ',
    'not a url',
  ])('rejects dangerous / non-http scheme %s', (url) => {
    expect(safeHttpUrl(url)).toBeNull();
  });

  it('rejects non-strings', () => {
    expect(safeHttpUrl(undefined)).toBeNull();
    expect(safeHttpUrl(42)).toBeNull();
    expect(safeHttpUrl(null)).toBeNull();
    expect(safeHttpUrl({ url: 'https://x.test' })).toBeNull();
  });
});

describe('escapeLikePattern', () => {
  it('escapes %, _ and backslash so they match literally', () => {
    expect(escapeLikePattern('100%')).toBe('100\\%');
    expect(escapeLikePattern('a_b')).toBe('a\\_b');
    expect(escapeLikePattern('c\\d')).toBe('c\\\\d');
  });

  it('escapes every metacharacter in a mixed string', () => {
    expect(escapeLikePattern('%_\\')).toBe('\\%\\_\\\\');
  });

  it('leaves ordinary text untouched', () => {
    expect(escapeLikePattern('Enugu General')).toBe('Enugu General');
  });
});
