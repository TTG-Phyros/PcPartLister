/**
 * Applies pending Drizzle migrations, then exits.
 * Run automatically by the container entrypoint before the server starts.
 */
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import path from 'node:path';

const MIGRATIONS_FOLDER = process.env.MIGRATIONS_FOLDER ?? path.resolve('drizzle');
const MAX_ATTEMPTS = 30;
const RETRY_DELAY_MS = 2000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required');

  // The compose healthcheck already gates us, but a freshly initialised
  // Postgres can still refuse the first connections.
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const sql = postgres(url, { max: 1, onnotice: () => {} });
    try {
      await sql`select 1`;
      await migrate(drizzle(sql), { migrationsFolder: MIGRATIONS_FOLDER });
      await sql.end({ timeout: 5 });
      console.log('[migrate] schema up to date');
      return;
    } catch (error) {
      await sql.end({ timeout: 5 }).catch(() => {});
      const isLast = attempt === MAX_ATTEMPTS;
      const message = error instanceof Error ? error.message : String(error);
      if (isLast) throw error;
      console.log(`[migrate] attempt ${attempt}/${MAX_ATTEMPTS} failed (${message}), retrying...`);
      await sleep(RETRY_DELAY_MS);
    }
  }
}

main().catch((error) => {
  console.error('[migrate] failed:', error);
  process.exit(1);
});
