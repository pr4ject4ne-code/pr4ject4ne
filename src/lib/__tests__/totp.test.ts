/**
 * Tests for TOTP-based 2FA helpers (migration 021). Pure crypto/formatting —
 * no DB mocking needed (totp.ts only reaches into @/lib/auth for the same
 * SHA-256 `hashToken` used by sessions/password-reset/email-verification,
 * which itself never touches the database).
 */
process.env.TOTP_ENCRYPTION_KEY = 'test-only-key-not-a-real-secret';

import { authenticator } from 'otplib';
import {
  generateTotpSecret,
  totpKeyUri,
  verifyTotpCode,
  generateChallengeToken,
  generateRecoveryCodes,
  hashRecoveryCode,
  matchRecoveryCode,
  encryptTotpSecret,
  decryptTotpSecret,
} from '@/lib/totp';

describe('TOTP secret + URI', () => {
  it('generates a base32 secret', () => {
    const secret = generateTotpSecret();
    expect(typeof secret).toBe('string');
    expect(secret.length).toBeGreaterThan(10);
    expect(secret).toMatch(/^[A-Z2-7]+=*$/);
  });

  it('builds an otpauth:// key URI with the Racoon Eye issuer', () => {
    const secret = generateTotpSecret();
    const uri = totpKeyUri('someone@example.com', secret);
    expect(uri.startsWith('otpauth://totp/')).toBe(true);
    expect(uri).toContain('Racoon%20Eye');
    expect(uri).toContain(secret);
    expect(uri).toContain(encodeURIComponent('someone@example.com'));
  });
});

describe('verifyTotpCode', () => {
  it('accepts a currently-valid code', () => {
    const secret = generateTotpSecret();
    const code = authenticator.generate(secret);
    expect(verifyTotpCode(secret, code)).toBe(true);
  });

  it('rejects an incorrect code', () => {
    const secret = generateTotpSecret();
    const validCode = authenticator.generate(secret);
    // Flip a digit to guarantee a different (invalid) code.
    const wrongDigit = validCode[0] === '0' ? '1' : '0';
    const wrongCode = wrongDigit + validCode.slice(1);
    expect(verifyTotpCode(secret, wrongCode)).toBe(false);
  });

  it('never throws on malformed input', () => {
    expect(verifyTotpCode('not-a-real-secret', 'abc')).toBe(false);
    expect(verifyTotpCode('', '')).toBe(false);
  });

  it('tolerates one time-step of clock drift (default window)', () => {
    const secret = generateTotpSecret();
    const originalOptions = { ...authenticator.options };
    try {
      authenticator.options = { epoch: Date.now() - 30_000 }; // one 30s step back
      const driftedCode = authenticator.generate(secret);
      // Restore real-time options before verifying, so verifyTotpCode checks
      // this drifted code against the CURRENT time window (± its tolerance).
      authenticator.options = originalOptions;
      expect(verifyTotpCode(secret, driftedCode)).toBe(true);
    } finally {
      authenticator.options = originalOptions;
    }
  });

  it('rejects a code far outside the tolerance window', () => {
    const secret = generateTotpSecret();
    const originalOptions = { ...authenticator.options };
    try {
      authenticator.options = { epoch: Date.now() - 10 * 60 * 1000 }; // 10 minutes back
      const staleCode = authenticator.generate(secret);
      authenticator.options = originalOptions;
      expect(verifyTotpCode(secret, staleCode)).toBe(false);
    } finally {
      authenticator.options = originalOptions;
    }
  });
});

describe('generateChallengeToken', () => {
  it('returns a random hex token, different each call', () => {
    const a = generateChallengeToken();
    const b = generateChallengeToken();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('recovery codes', () => {
  it('generates 8 unique, formatted codes', () => {
    const codes = generateRecoveryCodes();
    expect(codes).toHaveLength(8);
    expect(new Set(codes).size).toBe(8);
    for (const code of codes) {
      expect(code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    }
  });

  it('hashes deterministically (same code -> same hash) but not reversibly', () => {
    const codes = generateRecoveryCodes();
    const code = codes[0]!;
    const hash1 = hashRecoveryCode(code);
    const hash2 = hashRecoveryCode(code);
    expect(hash1).toBe(hash2);
    expect(hash1).not.toContain(code);
    // Case/whitespace-insensitive.
    expect(hashRecoveryCode(` ${code.toLowerCase()} `)).toBe(hash1);
  });

  it('matches a valid code against its stored hash and rejects an unknown one', () => {
    const codes = generateRecoveryCodes();
    const hashes = codes.map(hashRecoveryCode);
    const matched = matchRecoveryCode(hashes, codes[3]!);
    expect(matched).toBe(hashes[3]);
    expect(matchRecoveryCode(hashes, 'ZZZZ-ZZZZ-ZZZZ-ZZZZ')).toBeNull();
    expect(matchRecoveryCode(null, codes[0]!)).toBeNull();
    expect(matchRecoveryCode([], codes[0]!)).toBeNull();
  });

  it('consume-once: removing the matched hash makes the same code stop matching', () => {
    const codes = generateRecoveryCodes();
    let hashes = codes.map(hashRecoveryCode);
    const matched = matchRecoveryCode(hashes, codes[0]!);
    expect(matched).not.toBeNull();
    // Simulate the DB-side array_remove a caller performs on success.
    hashes = hashes.filter((h) => h !== matched);
    expect(matchRecoveryCode(hashes, codes[0]!)).toBeNull();
    // Other codes remain usable.
    expect(matchRecoveryCode(hashes, codes[1]!)).toBe(hashRecoveryCode(codes[1]!));
  });
});

describe('TOTP secret encryption', () => {
  it('round-trips a secret through encrypt/decrypt', () => {
    const secret = generateTotpSecret();
    const encrypted = encryptTotpSecret(secret);
    expect(encrypted).not.toContain(secret);
    expect(decryptTotpSecret(encrypted)).toBe(secret);
  });

  it('uses a fresh random IV each call (ciphertext differs for the same secret)', () => {
    const secret = generateTotpSecret();
    const first = encryptTotpSecret(secret);
    const second = encryptTotpSecret(secret);
    expect(first).not.toBe(second);
    expect(decryptTotpSecret(first)).toBe(secret);
    expect(decryptTotpSecret(second)).toBe(secret);
  });

  it('throws on a malformed payload rather than silently returning garbage', () => {
    expect(() => decryptTotpSecret('not-a-valid-payload')).toThrow();
  });

  it('throws when the encryption key is unset', () => {
    const original = process.env.TOTP_ENCRYPTION_KEY;
    delete process.env.TOTP_ENCRYPTION_KEY;
    try {
      expect(() => encryptTotpSecret('SOMEBASE32SECRET')).toThrow();
    } finally {
      process.env.TOTP_ENCRYPTION_KEY = original;
    }
  });
});
