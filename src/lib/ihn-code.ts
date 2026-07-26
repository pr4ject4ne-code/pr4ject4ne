import { randomInt } from 'node:crypto';

/**
 * IHN code — the patient's static, shareable emergency access key.
 *
 * Format: `IHN-XXXX-XXXX-XXXX` where X is an unambiguous alphanumeric char.
 * It NEVER rotates: once generated at signup it stays with the account so it can
 * be memorised/shared with close relatives for emergency biodata access.
 *
 * Ambiguous characters (0/O, 1/I/L) are excluded so it can be read aloud/copied
 * reliably in an emergency.
 *
 * `isValidIhnCode` lives in ihn-code-validate.ts (no `node:crypto` import) and
 * is re-exported here for existing server-side callers — a client component
 * needing it should import ihn-code-validate.ts directly instead of this
 * file, since this file's `generateIhnCode` needs a real CSPRNG and can't be
 * bundled for the browser.
 */
export { isValidIhnCode } from './ihn-code-validate';

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no O,I,L,0,1
const GROUPS = 3;
const GROUP_LEN = 4;

export function generateIhnCode(): string {
  const groups: string[] = [];
  for (let g = 0; g < GROUPS; g += 1) {
    let group = '';
    for (let i = 0; i < GROUP_LEN; i += 1) {
      // randomInt is CSPRNG-backed and avoids modulo bias.
      group += ALPHABET[randomInt(ALPHABET.length)];
    }
    groups.push(group);
  }
  return `IHN-${groups.join('-')}`;
}
