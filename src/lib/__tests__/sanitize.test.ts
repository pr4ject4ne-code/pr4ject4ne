import {
  sanitizeText,
  safeHttpUrl,
  escapeLikePattern,
  sanitizeLayer,
  sanitizeClinicalConditions,
} from '@/lib/sanitize';

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

describe('sanitizeLayer', () => {
  it('returns null for non-plain-object inputs (would corrupt merged JSON)', () => {
    expect(sanitizeLayer('a string')).toBeNull();
    expect(sanitizeLayer(['a', 'b'])).toBeNull();
    expect(sanitizeLayer(null)).toBeNull();
    expect(sanitizeLayer(42)).toBeNull();
    expect(sanitizeLayer(undefined)).toBeNull();
  });

  it('keeps primitive leaves and escapes string values', () => {
    expect(
      sanitizeLayer({ full_name: '<b>Ada</b>', height_cm: 170, is_public: true, address: null }),
    ).toEqual({ full_name: '&lt;b&gt;Ada&lt;/b&gt;', height_cm: 170, is_public: true, address: null });
  });

  it('drops nested objects and arrays (layers are flat)', () => {
    expect(sanitizeLayer({ ok: 'x', nested: { a: 1 }, arr: [1, 2] })).toEqual({ ok: 'x' });
  });

  it('caps the number of keys', () => {
    const big: Record<string, number> = {};
    for (let i = 0; i < 200; i += 1) big[`k${i}`] = i;
    expect(Object.keys(sanitizeLayer(big, 60)!).length).toBe(60);
  });

  it('truncates over-long string values', () => {
    expect(sanitizeLayer({ note: 'x'.repeat(50) }, 60, 10)).toEqual({ note: 'x'.repeat(10) });
  });

  it('returns an empty object for an empty object (valid, no-op patch)', () => {
    expect(sanitizeLayer({})).toEqual({});
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

describe('sanitizeClinicalConditions', () => {
  it('returns [] for non-arrays', () => {
    expect(sanitizeClinicalConditions(undefined)).toEqual([]);
    expect(sanitizeClinicalConditions('x')).toEqual([]);
    expect(sanitizeClinicalConditions({ condition: 'x' })).toEqual([]);
  });

  it('keeps valid entries, escapes text, and stamps a timestamp', () => {
    const out = sanitizeClinicalConditions([
      { condition: 'Hypertension', cause: 'Family <b>history</b>' },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].condition).toBe('Hypertension');
    expect(out[0].cause).toBe('Family &lt;b&gt;history&lt;/b&gt;');
    expect(typeof out[0].timestamp).toBe('string');
    expect(Number.isNaN(Date.parse(out[0].timestamp))).toBe(false);
  });

  it('drops entries with no condition and honours a valid client timestamp', () => {
    const ts = '2026-01-01T00:00:00.000Z';
    const out = sanitizeClinicalConditions([
      { cause: 'no condition' },
      { condition: '   ' },
      { condition: 'Diabetes', timestamp: ts },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].condition).toBe('Diabetes');
    expect(out[0].timestamp).toBe(ts);
  });

  it('caps the number of entries', () => {
    const many = Array.from({ length: 60 }, (_, i) => ({ condition: `C${i}` }));
    expect(sanitizeClinicalConditions(many, 50)).toHaveLength(50);
  });

  it('omits cause when empty', () => {
    const out = sanitizeClinicalConditions([{ condition: 'Asthma', cause: '   ' }]);
    expect(out[0].cause).toBeUndefined();
  });
});
