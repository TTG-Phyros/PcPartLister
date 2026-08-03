import { cache } from 'react';
import { db } from '@/lib/db';
import { settings } from '@/lib/db/schema';
import { DEFAULT_SETTINGS, settingsSchema, type AppSettings } from '@/lib/settings';

/**
 * Reads the settings rows and falls back to the defaults for anything missing
 * or invalid, so a hand-edited row can never break a page.
 * Cached per request.
 */
export const getSettings = cache(async (): Promise<AppSettings> => {
  const rows = await db.select().from(settings);
  const raw = Object.fromEntries(rows.map((row) => [row.key, row.value]));
  const parsed = settingsSchema.safeParse(raw);
  return parsed.success ? parsed.data : { ...DEFAULT_SETTINGS, ...pickValid(raw) };
});

/** Keeps only the keys that individually validate. */
function pickValid(raw: Record<string, unknown>): Partial<AppSettings> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    const single = settingsSchema.pick({ [key]: true } as never).safeParse({ [key]: value });
    if (single.success) Object.assign(result, single.data);
  }
  return result as Partial<AppSettings>;
}
