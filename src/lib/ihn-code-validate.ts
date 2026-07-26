/**
 * Client-safe half of ihn-code.ts — just the format/validation logic, no
 * `node:crypto` import. `generateIhnCode` (server-only, needs a CSPRNG) stays
 * in ihn-code.ts; this file exists so a client component (StringLookupClient)
 * can import `isValidIhnCode` without pulling `node:crypto` into the browser
 * bundle, which webpack cannot resolve there ("Reading from 'node:crypto' is
 * not handled by plugins" — a real broken build this fixes, confirmed live).
 */

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no O,I,L,0,1
const GROUP_LEN = 4;

const IHN_PATTERN = new RegExp(
  `^IHN-[${ALPHABET}]{${GROUP_LEN}}-[${ALPHABET}]{${GROUP_LEN}}-[${ALPHABET}]{${GROUP_LEN}}$`,
);

export function isValidIhnCode(code: string): boolean {
  return IHN_PATTERN.test(code);
}
