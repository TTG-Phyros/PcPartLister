import { and, eq, gte, lt, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { loginAttempts } from '@/lib/db/schema';

/** Sliding window over which failed attempts are counted. */
const WINDOW_MS = 15 * 60 * 1000;
/** Attempts allowed in the window before the IP is locked out. */
const MAX_FAILURES = 10;
/** Failures tolerated before the progressive delay kicks in. */
const FREE_ATTEMPTS = 2;
const MAX_DELAY_MS = 8000;
/** Attempt rows older than this are dropped opportunistically. */
const RETENTION_MS = 24 * 60 * 60 * 1000;

export type RateLimitVerdict =
  | { allowed: true; delayMs: number }
  | { allowed: false; retryAfterSeconds: number };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function countRecentFailures(ip: string): Promise<number> {
  const since = new Date(Date.now() - WINDOW_MS);
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(loginAttempts)
    .where(
      and(
        eq(loginAttempts.ip, ip),
        eq(loginAttempts.success, false),
        gte(loginAttempts.createdAt, since),
      ),
    );
  return rows[0]?.count ?? 0;
}

/**
 * Checks the sliding window for an IP. Beyond MAX_FAILURES the attempt is
 * refused outright; below it, each extra failure doubles the response delay
 * (0, 0, 1s, 2s, 4s, 8s, 8s...) which makes online guessing impractical
 * without ever locking a legitimate user out for long.
 */
export async function checkLoginRateLimit(ip: string): Promise<RateLimitVerdict> {
  const failures = await countRecentFailures(ip);

  if (failures >= MAX_FAILURES) {
    return { allowed: false, retryAfterSeconds: Math.ceil(WINDOW_MS / 1000) };
  }

  const over = Math.max(0, failures - FREE_ATTEMPTS);
  const delayMs = over === 0 ? 0 : Math.min(2 ** (over - 1) * 1000, MAX_DELAY_MS);
  return { allowed: true, delayMs };
}

export async function applyProgressiveDelay(delayMs: number): Promise<void> {
  if (delayMs > 0) await sleep(delayMs);
}

export async function recordLoginAttempt(
  ip: string,
  email: string | null,
  success: boolean,
): Promise<void> {
  await db.insert(loginAttempts).values({ ip, email, success });

  // Opportunistic cleanup, cheap enough to run on the success path only.
  // Note: use drizzle's typed operators rather than a raw `sql` template — a
  // Date interpolated into a raw template reaches postgres.js untyped and
  // blows up during Bind.
  if (success) {
    const cutoff = new Date(Date.now() - RETENTION_MS);
    await db.delete(loginAttempts).where(lt(loginAttempts.createdAt, cutoff));
  }
}

export const RATE_LIMIT_CONFIG = { WINDOW_MS, MAX_FAILURES, FREE_ATTEMPTS, MAX_DELAY_MS };
