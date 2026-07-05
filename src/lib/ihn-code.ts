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
 */

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

const IHN_PATTERN = new RegExp(
  `^IHN-[${ALPHABET}]{${GROUP_LEN}}-[${ALPHABET}]{${GROUP_LEN}}-[${ALPHABET}]{${GROUP_LEN}}$`,
);

export function isValidIhnCode(code: string): boolean {
  return IHN_PATTERN.test(code);
}
