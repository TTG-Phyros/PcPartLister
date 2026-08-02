/**
 * Idempotent seed. Safe to run on every container start: it inserts what is
 * missing and never overwrites user data.
 */
import { drizzle } from 'drizzle-orm/postgres-js';
import { sql } from 'drizzle-orm';
import postgres from 'postgres';
import { settings, users } from '../src/lib/db/schema';
import { DEFAULT_SETTINGS } from '../src/lib/settings';
import { hashPassword } from '../src/lib/auth/password';

type Db = ReturnType<typeof drizzle>;

async function seedSettings(db: Db) {
  const rows = Object.entries(DEFAULT_SETTINGS).map(([key, value]) => ({ key, value }));
  // onConflictDoNothing: an existing value is a value the user chose.
  await db.insert(settings).values(rows).onConflictDoNothing({ target: settings.key });
  console.log(`[seed] settings: ${rows.length} default keys ensured`);
}

/**
 * Creates the bootstrap administrator, but only while no account exists at all.
 * Once the app has users, ADMIN_PASSWORD is inert: rotating the variable can
 * never reset a live account, and a deleted admin is not silently recreated.
 */
async function seedAdminUser(db: Db) {
  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(users);
  if (count > 0) {
    console.log(`[seed] users: ${count} account(s) present, admin bootstrap skipped`);
    return;
  }

  const email = (process.env.ADMIN_EMAIL ?? 'admin@pcpartlister.local').trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD ?? 'changeme123';
  if (password.length < 10) {
    console.warn(
      '[seed] ADMIN_PASSWORD is shorter than the 10 characters the app enforces; ' +
        'the account is created but you will have to pick a longer one at first login.',
    );
  }

  await db.insert(users).values({
    email,
    passwordHash: await hashPassword(password),
    role: 'admin',
    // Access stays blocked until this initial password is replaced.
    mustChangePassword: true,
  });
  console.log(`[seed] users: bootstrap admin created (${email})`);
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required');

  const sqlClient = postgres(url, { max: 1, onnotice: () => {} });
  const db = drizzle(sqlClient);
  try {
    await seedSettings(db);
    await seedAdminUser(db);
    console.log('[seed] done');
  } finally {
    await sqlClient.end({ timeout: 5 });
  }
}

main().catch((error) => {
  console.error('[seed] failed:', error);
  process.exit(1);
});
