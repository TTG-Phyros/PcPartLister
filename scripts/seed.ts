/**
 * Idempotent seed. Safe to run on every container start: it inserts what is
 * missing and never overwrites user data.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq, sql } from 'drizzle-orm';
import postgres from 'postgres';
import { catalogComponents, settings, users } from '../src/lib/db/schema';
import { DEFAULT_SETTINGS } from '../src/lib/settings';
import { hashPassword } from '../src/lib/auth/password';
import { eurosToCents, parseSeedFile, type ParsedSeedEntry } from '../src/lib/catalog/seed-schema';
import { buildPlaceholderSvg } from '../src/lib/images/placeholder';
import { ALLOWED_IMAGE_TYPES, MAX_IMAGE_BYTES, saveImage } from '../src/lib/images/store';

type Db = ReturnType<typeof drizzle>;

const IMAGE_DOWNLOAD_TIMEOUT_MS = 8000;

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

/**
 * Tries the optional imageUrl, falls back to a locally generated placeholder.
 * The app must stay fully usable with no network access at all.
 */
async function ensureImage(entry: ParsedSeedEntry): Promise<string> {
  if (entry.imageUrl) {
    try {
      const response = await fetch(entry.imageUrl, {
        signal: AbortSignal.timeout(IMAGE_DOWNLOAD_TIMEOUT_MS),
        headers: { 'User-Agent': 'PcPartLister-seed/1.0' },
      });
      const contentType = response.headers.get('content-type')?.split(';')[0]?.trim() ?? '';
      const extension = ALLOWED_IMAGE_TYPES[contentType];

      if (response.ok && extension) {
        const buffer = Buffer.from(await response.arrayBuffer());
        if (buffer.byteLength > 0 && buffer.byteLength <= MAX_IMAGE_BYTES) {
          return await saveImage(`catalog/${entry.key}${extension}`, buffer);
        }
      }
      console.warn(`[seed] image for ${entry.key}: unusable response, using placeholder`);
    } catch {
      console.warn(`[seed] image for ${entry.key}: download failed, using placeholder`);
    }
  }

  const svg = buildPlaceholderSvg({
    category: entry.category,
    brand: entry.brand,
    model: entry.model,
  });
  return saveImage(`catalog/${entry.key}.svg`, svg);
}

async function seedCatalog(db: Db) {
  const dir = process.env.SEED_DATA_DIR ?? path.resolve('data/seed');
  const file = path.join(dir, 'catalog.json');

  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(file, 'utf8'));
  } catch (error) {
    console.warn(`[seed] catalog: ${file} unreadable (${String(error)}), skipped`);
    return;
  }

  const { entries, errors } = parseSeedFile(raw);
  for (const message of errors) console.warn(`[seed] catalog: ${message}`);
  if (entries.length === 0) {
    console.warn('[seed] catalog: no valid entry, skipped');
    return;
  }

  // One query instead of N: everything already seeded is left untouched.
  const existing = await db
    .select({ seedKey: catalogComponents.seedKey, imagePath: catalogComponents.imagePath })
    .from(catalogComponents);
  const known = new Map(existing.filter((r) => r.seedKey).map((r) => [r.seedKey!, r]));

  let inserted = 0;
  let images = 0;

  for (const entry of entries) {
    const current = known.get(entry.key);

    if (current) {
      // Present already: never overwrite, only restore a missing picture.
      if (!current.imagePath) {
        const imagePath = await ensureImage(entry);
        await db
          .update(catalogComponents)
          .set({ imagePath })
          .where(eq(catalogComponents.seedKey, entry.key));
        images++;
      }
      continue;
    }

    const imagePath = await ensureImage(entry);
    images++;

    const result = await db
      .insert(catalogComponents)
      .values({
        category: entry.category,
        brand: entry.brand,
        model: entry.model,
        specs: entry.specs,
        imagePath,
        msrpCents: eurosToCents(entry.msrpEur),
        releaseYear: entry.releaseYear ?? null,
        seedKey: entry.key,
      })
      // A model the user already created by hand wins: same natural key, no clash.
      .onConflictDoNothing()
      .returning({ id: catalogComponents.id });

    if (result.length > 0) inserted++;
  }

  console.log(
    `[seed] catalog: ${entries.length} entries in file, ${inserted} inserted, ${images} images written`,
  );
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required');

  const sqlClient = postgres(url, { max: 1, onnotice: () => {} });
  const db = drizzle(sqlClient);
  try {
    await seedSettings(db);
    await seedAdminUser(db);
    await seedCatalog(db);
    console.log('[seed] done');
  } finally {
    await sqlClient.end({ timeout: 5 });
  }
}

main().catch((error) => {
  console.error('[seed] failed:', error);
  process.exit(1);
});
