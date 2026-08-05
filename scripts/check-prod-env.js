#!/usr/bin/env node
// scripts/check-prod-env.js
// Simple Node script to verify required production environment variables are set.
// Run: node scripts/check-prod-env.js

const required = [
  'DATABASE_URL',
  'NODE_ENV',
  'SITE_URL',
  'RESEND_API_KEY',
  'RESEND_FROM_EMAIL',
  'NEXT_PUBLIC_MAPTILER_KEY',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_STORAGE_BUCKET',
  'TOTP_ENCRYPTION_KEY'
];

const missing = required.filter((k) => !process.env[k]);

if (missing.length > 0) {
  console.error('Missing required production environment variables:\n');
  for (const k of missing) console.error('- ' + k);
  console.error('\nPlease set these in your hosting platform before deploying.');
  process.exit(1);
}

console.log('All required production environment variables are present.');
process.exit(0);
