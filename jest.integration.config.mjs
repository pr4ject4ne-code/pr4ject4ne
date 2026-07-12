import nextJest from 'next/jest.js';

const createJestConfig = nextJest({ dir: './' });

/**
 * Integration tests run against a REAL Postgres (DATABASE_URL). They exercise the
 * SQL the mocked unit suite can't — the advisory-lock rate limiter, real session
 * rows, and the trigram search path. Kept in a separate config so the default
 * `npm test` stays fast and DB-free.
 *
 * @type {import('jest').Config}
 */
const config = {
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' },
  testEnvironment: 'node',
  testMatch: ['**/*.integration.test.ts'],
  // Load .env.local (Next skips it under NODE_ENV=test); no-op in CI.
  setupFiles: ['<rootDir>/scripts/jest-load-env.cjs'],
  testTimeout: 30000,
};

export default createJestConfig(config);
