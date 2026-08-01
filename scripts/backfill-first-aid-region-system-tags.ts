/**
 * Backfill `region_tags` / `system_tags` on existing first-aid entries from
 * their existing `tags` (topic/scenario) values, via the deterministic
 * crosswalk in src/lib/first-aid-tag-crosswalk.ts (see migration 022).
 *
 * Idempotency guard: only touches rows where BOTH region_tags and
 * system_tags are still the empty default `{}` — never clobbers a value a
 * developer already hand-set through the admin form/API. Pass `--force` to
 * bypass the guard and re-derive every row from `tags` regardless of its
 * current region_tags/system_tags (a deliberate full re-derive, off by
 * default).
 *
 * A row with an empty `tags[]` has nothing to derive from — it is left
 * alone and reported in the "NEEDS MANUAL REVIEW" section of the summary
 * instead of being silently skipped without comment. A row whose `tags[]`
 * ARE set but whose crosswalk union is still empty (e.g. only
 * "Foreign object"/"Dental injury", which have no clean region/system fit)
 * is also flagged for manual review, since it means the entry landed with
 * no anatomical tags despite having topic tags to derive from.
 *
 * Never touches any column other than `region_tags`/`system_tags`.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/backfill-first-aid-region-system-tags.ts
 *   npx tsx --env-file=.env.local scripts/backfill-first-aid-region-system-tags.ts --force
 */
import { Pool } from 'pg';
import { deriveRegionSystemTags } from '../src/lib/first-aid-tag-crosswalk';

interface Row {
  id: string;
  title: string;
  tags: string[];
  region_tags: string[];
  system_tags: string[];
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('DATABASE_URL is not set. Configure .env.local first.');
    process.exit(1);
  }

  const force = process.argv.includes('--force');

  const pool = new Pool({ connectionString });
  try {
    const { rows } = await pool.query<Row>(
      'SELECT id, title, tags, region_tags, system_tags FROM first_aid_entries',
    );

    let updated = 0;
    let skippedAlreadyTagged = 0;
    const flagged: { id: string; title: string; reason: string }[] = [];

    for (const row of rows) {
      const alreadyTagged =
        (row.region_tags?.length ?? 0) > 0 || (row.system_tags?.length ?? 0) > 0;

      if (alreadyTagged && !force) {
        skippedAlreadyTagged += 1;
        continue;
      }

      const tags = row.tags ?? [];
      if (tags.length === 0) {
        flagged.push({ id: row.id, title: row.title, reason: 'no tags[] to derive from' });
        continue;
      }

      const { regions, systems } = deriveRegionSystemTags(tags);
      if (regions.length === 0 && systems.length === 0) {
        flagged.push({
          id: row.id,
          title: row.title,
          reason: `tags [${tags.join(', ')}] have no region/system crosswalk fit`,
        });
        continue;
      }

      await pool.query(
        'UPDATE first_aid_entries SET region_tags = $2, system_tags = $3 WHERE id = $1',
        [row.id, regions, systems],
      );
      updated += 1;
    }

    console.warn('--- Backfill summary ---');
    console.warn(`Total entries scanned: ${rows.length}`);
    console.warn(`Updated:               ${updated}`);
    console.warn(`Skipped (already tagged, use --force to override): ${skippedAlreadyTagged}`);
    console.warn(`Flagged for manual review: ${flagged.length}`);
    if (flagged.length > 0) {
      console.warn('\n--- NEEDS MANUAL REVIEW ---');
      for (const f of flagged) {
        console.warn(`  ${f.id}  "${f.title}"  — ${f.reason}`);
      }
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
