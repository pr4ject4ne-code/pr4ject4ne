/**
 * Jest setupFile for the integration config: loads .env.local into process.env
 * for keys not already set. Next deliberately ignores .env.local under
 * NODE_ENV=test, so integration tests (which need DATABASE_URL) wouldn't see it
 * otherwise. In CI, DATABASE_URL is already set by the Postgres service and this
 * file is a no-op (it never overrides an existing value, and skips if the file is
 * absent). Dependency-free — a minimal KEY=VALUE parser, not full dotenv.
 */
const fs = require('node:fs');
const path = require('node:path');

const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  for (const raw of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}
