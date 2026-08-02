import { z } from 'zod';

/**
 * Server-side environment. Parsed lazily so that the Next.js build (which runs
 * without a database) never trips on missing runtime variables.
 */
const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  SESSION_SECRET: z.string().min(32, 'SESSION_SECRET must be at least 32 characters'),
  ADMIN_EMAIL: z.string().email().default('admin@pcpartlister.local'),
  ADMIN_PASSWORD: z.string().min(8).default('changeme123'),
  COOKIE_SECURE: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
  IMAGES_DIR: z.string().default('/app/data/images'),
  SESSION_TTL_HOURS: z.coerce.number().int().positive().default(24 * 14),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

export function getEnv(): Env {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${details}`);
  }
  cached = parsed.data;
  return cached;
}
