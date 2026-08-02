import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { and, eq, gt, lt, ne } from 'drizzle-orm';
import { cookies } from 'next/headers';
import { db } from '@/lib/db';
import { sessions, users, type User } from '@/lib/db/schema';
import { getEnv } from '@/lib/env';

export const SESSION_COOKIE = 'pcpl_session';

/** Below this remaining lifetime ratio, an active session gets extended. */
const RENEW_AFTER_MS = 60 * 60 * 1000;

/**
 * The database stores an HMAC of the token, never the token itself: a leaked
 * database dump cannot be replayed as a set of valid cookies.
 */
function tokenId(token: string): string {
  return createHmac('sha256', getEnv().SESSION_SECRET).update(token).digest('hex');
}

function ttlMs(): number {
  return getEnv().SESSION_TTL_HOURS * 60 * 60 * 1000;
}

export function cookieOptions() {
  return {
    httpOnly: true,
    secure: getEnv().COOKIE_SECURE,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: Math.floor(ttlMs() / 1000),
  };
}

export type SessionContext = { user: User; sessionId: string };

export async function createSession(
  userId: string,
  meta: { ip?: string | null; userAgent?: string | null } = {},
): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  await db.insert(sessions).values({
    id: tokenId(token),
    userId,
    expiresAt: new Date(Date.now() + ttlMs()),
    ip: meta.ip ?? null,
    userAgent: meta.userAgent?.slice(0, 512) ?? null,
  });
  return token;
}

/** Writes the session cookie. Only valid inside a Server Action or Route Handler. */
export async function setSessionCookie(token: string): Promise<void> {
  (await cookies()).set(SESSION_COOKIE, token, cookieOptions());
}

export async function clearSessionCookie(): Promise<void> {
  (await cookies()).set(SESSION_COOKIE, '', { ...cookieOptions(), maxAge: 0 });
}

/**
 * Resolves the cookie to a user, sliding the expiry when the session has been
 * idle for more than an hour. Returns null for missing, unknown or expired
 * sessions.
 */
export async function resolveSession(token: string | undefined): Promise<SessionContext | null> {
  if (!token) return null;

  const id = tokenId(token);
  const rows = await db
    .select({ session: sessions, user: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, id), gt(sessions.expiresAt, new Date())))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  if (Date.now() - row.session.lastSeenAt.getTime() > RENEW_AFTER_MS) {
    await db
      .update(sessions)
      .set({ lastSeenAt: new Date(), expiresAt: new Date(Date.now() + ttlMs()) })
      .where(eq(sessions.id, id));
  }

  return { user: row.user, sessionId: id };
}

export async function readSessionToken(): Promise<string | undefined> {
  return (await cookies()).get(SESSION_COOKIE)?.value;
}

export async function destroySession(token: string | undefined): Promise<void> {
  if (!token) return;
  await db.delete(sessions).where(eq(sessions.id, tokenId(token)));
}

/** Used after a password change, so every other device is signed out. */
export async function destroyOtherUserSessions(userId: string, keepSessionId: string) {
  await db
    .delete(sessions)
    .where(and(eq(sessions.userId, userId), ne(sessions.id, keepSessionId)));
}

/** Used when an admin resets or deletes an account. */
export async function destroyAllUserSessions(userId: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.userId, userId));
}

export async function purgeExpiredSessions(): Promise<void> {
  await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
}

/** Constant-time compare helper for any secret string comparison. */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}
