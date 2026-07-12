import nextJest from 'next/jest.js';

const createJestConfig = nextJest({
  dir: './',
});

/** @type {import('jest').Config} */
const customJestConfig = {
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  // Default to node; component/React tests opt into jsdom with a per-file
  // `@jest-environment jsdom` docblock. This keeps Node-only modules like `pg`
  // working in lib/API tests without a jsdom crypto shim.
  testEnvironment: 'node',
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/__tests__/**',
    '!src/types/**',
  ],
  // Integration tests (real Postgres) run via `npm run test:integration`, not the
  // default mocked suite.
  testPathIgnorePatterns: [
    '<rootDir>/.next/',
    '<rootDir>/node_modules/',
    '\\.integration\\.test\\.ts$',
  ],
};

export default createJestConfig(customJestConfig);
