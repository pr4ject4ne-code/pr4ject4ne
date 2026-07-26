import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isValidIhnCode } from '@/lib/ihn-code-validate';

describe('ihn-code-validate', () => {
  it('validates the standard IHN format', () => {
    expect(isValidIhnCode('IHN-ABCD-2345-XYZW')).toBe(true);
    expect(isValidIhnCode('not-an-ihn-code')).toBe(false);
    expect(isValidIhnCode('')).toBe(false);
  });

  // Regression test for a real bug: this module must stay importable by
  // client components (StringLookupClient.tsx) without pulling in
  // `node:crypto` — that import lives in the sibling ihn-code.ts (which owns
  // generateIhnCode, a server-only CSPRNG user) and previously lived in THIS
  // file too, at the top of the same module isValidIhnCode was exported
  // from. Any client component importing isValidIhnCode dragged the whole
  // module graph in, and webpack cannot bundle `node:crypto` for the
  // browser — this was a genuine broken build (GET /string-lookup 500'd
  // with "Reading from 'node:crypto' is not handled by plugins"), not a
  // hypothetical. A source-text check (not just "does isValidIhnCode still
  // work in Jest's Node environment", which wouldn't catch this) is what
  // actually guards against reintroducing it.
  it('never imports node:crypto (or any node: built-in) — must stay safe for client bundles', () => {
    const source = readFileSync(join(__dirname, '..', 'ihn-code-validate.ts'), 'utf8');
    // Match only actual import/require statements (line-anchored), not
    // prose in comments — this file's own doc comment quotes the literal
    // webpack error message, which contains the substring "from 'node:"
    // without being an import at all.
    expect(source).not.toMatch(/^\s*import\b.*from\s+['"]node:/m);
    expect(source).not.toMatch(/^\s*(?:const|let|var)\b.*require\(\s*['"]node:/m);
  });
});
