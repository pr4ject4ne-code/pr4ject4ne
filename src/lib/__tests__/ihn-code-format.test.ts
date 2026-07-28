import { autoFormatIhnInput } from '@/lib/ihn-code-format';
import { isValidIhnCode } from '@/lib/ihn-code-validate';

/**
 * Founder ask (not a numbered worklist item): auto-format IHN code inputs so
 * users never have to hand-type the exact "IHN-XXXX-XXXX-XXXX" shape or
 * worry about capslock. See ihn-code-format.ts for the design rationale
 * (fixed "IHN-" prefix, stateless dash derivation, invalid chars dropped).
 */
describe('autoFormatIhnInput', () => {
  it('uppercases lowercase input regardless of capslock state', () => {
    expect(autoFormatIhnInput('ihn-abcd')).toBe('IHN-ABCD');
    expect(autoFormatIhnInput('abcd')).toBe('IHN-ABCD');
  });

  it('auto-inserts dashes at the 4-character group boundaries as the user types', () => {
    expect(autoFormatIhnInput('A')).toBe('IHN-A');
    expect(autoFormatIhnInput('ABCD')).toBe('IHN-ABCD');
    expect(autoFormatIhnInput('ABCDE')).toBe('IHN-ABCD-E');
    expect(autoFormatIhnInput('ABCDEFGH')).toBe('IHN-ABCD-EFGH');
    expect(autoFormatIhnInput('ABCDEFGHJ')).toBe('IHN-ABCD-EFGH-J');
    expect(autoFormatIhnInput('ABCDEFGHJKMN')).toBe('IHN-ABCD-EFGH-JKMN');
  });

  it('strips characters outside the code alphabet (including the excluded O/I/L/0/1)', () => {
    expect(autoFormatIhnInput('AOBILC0D1E')).toBe('IHN-ABCD-E');
    expect(autoFormatIhnInput('A!B@C#D$')).toBe('IHN-ABCD');
  });

  it('passes a full, already-correctly-formatted pasted code through unchanged', () => {
    const pasted = 'IHN-AB23-CD45-EF67';
    expect(autoFormatIhnInput(pasted)).toBe(pasted);
    expect(isValidIhnCode(autoFormatIhnInput(pasted))).toBe(true);
  });

  it('inserts dashes into a pasted code that has none, prefix included', () => {
    expect(autoFormatIhnInput('IHNAB23CD45EF67')).toBe('IHN-AB23-CD45-EF67');
  });

  it('handles a pasted code with a lowercase, space-separated, dash-free prefix', () => {
    expect(autoFormatIhnInput('ihn ab23cd45ef67')).toBe('IHN-AB23-CD45-EF67');
  });

  it('handles a pasted code with no IHN prefix at all', () => {
    expect(autoFormatIhnInput('ab23-cd45-ef67')).toBe('IHN-AB23-CD45-EF67');
  });

  it('never produces a duplicated prefix from pasted text that already includes one', () => {
    expect(autoFormatIhnInput('IHN-AB23-CD45-EF67')).not.toMatch(/^IHN-IHN-/);
  });

  it('does not fight the user deleting the character right before an auto-inserted dash', () => {
    // User typed a 5th character, which triggers a dash before it...
    expect(autoFormatIhnInput('ABCDE')).toBe('IHN-ABCD-E');
    // ...then backspaces it away. The next onChange fires with that char
    // (and, since it's the last char in the field, its now-orphaned dash)
    // already gone from the raw value — the formatter must not re-insert
    // the dash on this call, it should just settle back to the 4-char group.
    expect(autoFormatIhnInput('ABCD-')).toBe('IHN-ABCD');
    expect(autoFormatIhnInput('ABCD')).toBe('IHN-ABCD');
  });

  it('falls back to just the fixed prefix when there is no valid content yet', () => {
    expect(autoFormatIhnInput('')).toBe('IHN-');
    expect(autoFormatIhnInput('!!!')).toBe('IHN-');
  });
});
