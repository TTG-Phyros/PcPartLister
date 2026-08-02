/**
 * Idempotent seed. Safe to run on every container start: it inserts what is
 * missing and never overwrites user data.
 *
 * Steps are added as the app grows (admin user, catalog, images).
 */
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { settings } from '../src/lib/db/schema';
import { DEFAULT_SETTINGS } from '../src/lib/settings';

async function seedSettings(db: ReturnType<typeof drizzle>) {
  const rows = Object.entries(DEFAULT_SETTINGS).map(([key, value]) => ({ key, value }));
  // onConflictDoNothing: an existing value is a value the user chose.
  await db.insert(settings).values(rows).onConflictDoNothing({ target: settings.key });
  console.log(`[seed] settings: ${rows.length} default keys ensured`);
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required');

  const sql = postgres(url, { max: 1, onnotice: () => {} });
  const db = drizzle(sql);
  try {
    await seedSettings(db);
    console.log('[seed] done');
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((error) => {
  console.error('[seed] failed:', error);
  process.exit(1);
});
