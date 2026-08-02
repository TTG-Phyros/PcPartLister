import { defineConfig } from 'drizzle-kit';

// `drizzle-kit generate` does not need a reachable database, only a valid URL.
const url =
  process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/pcpartlister';

export default defineConfig({
  schema: './src/lib/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url },
  strict: true,
  verbose: true,
});
