/**
 * Founder ask (not a numbered worklist item): "let the system automatically
 * put the dashes or [be] able to read if it isn't there or capslock is
 * enabled or disabled" — i.e. stop making users type the exact
 * `IHN-XXXX-XXXX-XXXX` format themselves.
 *
 * Client-safe (no `node:` imports — see ihn-code-validate.ts's own doc
 * comment for the real broken-build bug that class of mistake caused here
 * before) so it can be imported from any client component that has a user
 * type an IHN code.
 *
 * Design choice: the "IHN-" prefix is treated as FIXED, not something the
 * user types. `autoFormatIhnInput` always returns a string starting with
 * "IHN-", stripping any leading "IHN" the user/pasted text happens to
 * include (with or without a following dash/space, any case) so pasting a
 * full shared code — "IHN-AB12-CD34-EF56", "ihn ab12cd34ef56", or just the
 * body with no prefix at all — never produces a duplicated/broken prefix.
 * This is simpler and more robust than trying to detect "has the user typed
 * enough of literal I-H-N yet" letter by letter, and it makes capslock and
 * missing dashes both irrelevant to the user.
 *
 * Dash auto-insertion is derived fresh from the filtered character content
 * every call (stateless), not tracked separately — a dash only appears
 * between two groups once the second group has at least one character. That
 * means backspacing the last-typed character of a group naturally also
 * drops the now-unneeded trailing dash on the very next keystroke, instead
 * of the formatter fighting the user by re-inserting it (the same pattern
 * common card-number auto-formatters use).
 *
 * Invalid characters (anything not in the code alphabet, and not a stray
 * prefix/separator) are silently dropped rather than speculatively remapped
 * — the alphabet excludes O/I/L/0/1 specifically to avoid ambiguity, and
 * there's no single unambiguous "did they mean O or 0" target to map a
 * mistyped character to, so dropping is the correct, simplest behavior.
 */

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no O,I,L,0,1 — must match ihn-code-validate.ts
const GROUP_LEN = 4;
const GROUP_COUNT = 3;
const PREFIX = 'IHN-';

const INVALID_CHAR = new RegExp(`[^${ALPHABET}]`, 'g');
// `+` (not just one match) — the field already displays "IHN-" before the
// user types/pastes anything, so pasting a full "IHN-XXXX-..." code at the
// end produces a DOUBLED "IHN-IHN-XXXX-..." raw value; only stripping one
// occurrence would leave the second "IHN-" behind (bug found 2026-07-29:
// "the paste in find IHN should know to remove 'IHN-' while pasting").
const LEADING_PREFIX = /^(\s*IHN[-\s]*)+/;

/**
 * Normalizes whatever the user has typed/pasted so far into the live
 * "IHN-XXXX-XXXX-XXXX" format, uppercasing, stripping anything outside the
 * code alphabet, and auto-inserting dashes at the group boundaries. Intended
 * to be called with the input's raw value on every change.
 */
export function autoFormatIhnInput(rawValue: string): string {
  const upper = rawValue.toUpperCase().replace(LEADING_PREFIX, '');
  const body = upper.replace(INVALID_CHAR, '').slice(0, GROUP_LEN * GROUP_COUNT);

  if (!body) return PREFIX;

  const groups: string[] = [];
  for (let i = 0; i < body.length; i += GROUP_LEN) {
    groups.push(body.slice(i, i + GROUP_LEN));
  }

  return `${PREFIX}${groups.join('-')}`;
}
