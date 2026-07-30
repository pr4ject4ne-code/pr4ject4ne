import { createCipheriv, createDecipheriv, createHash, randomBytes, randomInt } from 'node:crypto';
import { authenticator } from 'otplib';
import { hashToken } from '@/lib/auth';

/**
 * TOTP-based two-factor authentication for primary admin/developer accounts
 * (migration 021). Pure crypto/formatting helpers — no database access here;
 * callers (the /api/dev/totp/* routes and /api/auth/login/totp) own reading
 * and writing `users.totp_*` / `mfa_challenges`.
 */

const ISSUER = 'Racoon Eye';

// ---------------------------------------------------------------------------
// TOTP secret + code verification
// ---------------------------------------------------------------------------

/** A new base32 TOTP shared secret, generated via otplib's CSPRNG-backed helper. */
export function generateTotpSecret(): string {
  return authenticator.generateSecret();
}

/** `otpauth://` URI for authenticator-app enrollment (rendered as a QR code client-side). */
export function totpKeyUri(email: string, secret: string): string {
  return authenticator.keyuri(email, ISSUER, secret);
}

/**
 * Verify a 6-digit code against a secret using otplib's default tolerance
 * window (±1 step / ~30s of clock drift). Never throws — a malformed code
 * (wrong length, non-numeric) is just an invalid code, not a server error.
 */
export function verifyTotpCode(secret: string, code: string): boolean {
  try {
    return authenticator.verify({ token: code, secret });
  } catch {
    return false;
  }
}

/** A fresh single-use challenge token for the login MFA step (same shape as a session token). */
export function generateChallengeToken(): string {
  return randomBytes(32).toString('hex');
}

// ---------------------------------------------------------------------------
// Recovery codes
// ---------------------------------------------------------------------------

const RECOVERY_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no O,I,L,0,1 — mirrors ihn-code.ts
const RECOVERY_GROUPS = 4;
const RECOVERY_GROUP_LEN = 4;
const RECOVERY_CODE_COUNT = 8;

function generateOneRecoveryCode(): string {
  const groups: string[] = [];
  for (let g = 0; g < RECOVERY_GROUPS; g += 1) {
    let group = '';
    for (let i = 0; i < RECOVERY_GROUP_LEN; i += 1) {
      group += RECOVERY_ALPHABET[randomInt(RECOVERY_ALPHABET.length)];
    }
    groups.push(group);
  }
  return groups.join('-');
}

/** 8 high-entropy, single-use recovery codes, shown to the account holder exactly once. */
export function generateRecoveryCodes(count: number = RECOVERY_CODE_COUNT): string[] {
  return Array.from({ length: count }, generateOneRecoveryCode);
}

/**
 * Normalize a recovery code before hashing/matching (case/whitespace only —
 * never widen what counts as a match beyond that).
 */
function normalizeRecoveryCode(code: string): string {
  return code.trim().toUpperCase();
}

/**
 * SHA-256 hash of a recovery code, for at-rest storage — same approach as
 * every other single-use token in this codebase (session tokens,
 * email-verification / password-reset tokens; see src/lib/auth.ts's
 * `hashToken`). These are high-entropy, machine-generated codes, not
 * human-chosen passwords, so a slow hash (bcrypt) buys nothing here.
 */
export function hashRecoveryCode(code: string): string {
  return hashToken(normalizeRecoveryCode(code));
}

/**
 * Look up a candidate recovery code against a user's stored hashes. Returns
 * the MATCHED HASH (not the code) so the caller can remove exactly that entry
 * from `totp_recovery_codes` — never returns the plaintext code back out.
 * Returns null on no match (including an empty/missing hash list).
 */
export function matchRecoveryCode(hashedCodes: string[] | null | undefined, code: string): string | null {
  if (!hashedCodes || hashedCodes.length === 0 || !code) return null;
  const candidateHash = hashRecoveryCode(code);
  return hashedCodes.includes(candidateHash) ? candidateHash : null;
}

// ---------------------------------------------------------------------------
// At-rest encryption of the TOTP secret (AES-256-GCM, Node's built-in crypto)
// ---------------------------------------------------------------------------

const CIPHER_ALGO = 'aes-256-gcm';
const IV_LENGTH = 12; // recommended nonce length for GCM

/**
 * Derive a 32-byte AES-256 key from TOTP_ENCRYPTION_KEY via SHA-256, so any
 * length/format of env var value works. Throws (not a silent fallback) if the
 * env var is unset — a missing encryption key must fail loudly, never store a
 * TOTP secret unencrypted or with a predictable key.
 */
function getEncryptionKey(): Buffer {
  const raw = process.env.TOTP_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      'TOTP_ENCRYPTION_KEY is not set. Configure it (see .env.example) before enrolling any account in 2FA.',
    );
  }
  return createHash('sha256').update(raw).digest();
}

/**
 * Encrypt a TOTP secret for storage in `users.totp_secret_encrypted`. Format:
 * `<iv>:<authTag>:<ciphertext>`, each base64. A fresh random IV every call, so
 * encrypting the same secret twice never produces the same ciphertext.
 */
export function encryptTotpSecret(secret: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(CIPHER_ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString('base64'), authTag.toString('base64'), encrypted.toString('base64')].join(':');
}

/** Decrypt a value produced by `encryptTotpSecret`. Throws on a malformed payload or wrong key/tampered data. */
export function decryptTotpSecret(payload: string): string {
  const [ivB64, tagB64, dataB64] = payload.split(':');
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error('Malformed encrypted TOTP secret.');
  }
  const key = getEncryptionKey();
  const iv = Buffer.from(ivB64, 'base64');
  const authTag = Buffer.from(tagB64, 'base64');
  const data = Buffer.from(dataB64, 'base64');
  const decipher = createDecipheriv(CIPHER_ALGO, key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
  return decrypted.toString('utf8');
}
