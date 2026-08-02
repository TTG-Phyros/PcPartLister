import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { getEnv } from '@/lib/env';
import * as schema from './schema';

export type Database = PostgresJsDatabase<typeof schema>;

/**
 * A single pooled connection per process, cached on globalThis so the dev
 * server's module reloading does not open a new pool on every edit.
 *
 * The instance is created lazily behind a Proxy: `next build` imports this
 * module while collecting page data, at a point where DATABASE_URL may not be
 * set, and connecting there would fail the build for nothing.
 */
const globalForDb = globalThis as unknown as {
  __pcpl_sql?: ReturnType<typeof postgres>;
  __pcpl_db?: Database;
};

export function getDb(): Database {
  if (!globalForDb.__pcpl_db) {
    globalForDb.__pcpl_sql ??= postgres(getEnv().DATABASE_URL, { max: 10 });
    globalForDb.__pcpl_db = drizzle(globalForDb.__pcpl_sql, { schema });
  }
  return globalForDb.__pcpl_db;
}

export const db = new Proxy({} as Database, {
  get: (_target, prop, receiver) => Reflect.get(getDb(), prop, receiver),
});

export { schema };
