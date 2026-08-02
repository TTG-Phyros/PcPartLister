import { cache } from 'react';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import type { User } from '@/lib/db/schema';
import { readSessionToken, resolveSession, type SessionContext } from './session';

/**
 * Single entry point for authentication. Every page, Server Action and Route
 * Handler goes through this: nothing reads the database without it.
 *
 * Wrapped in React's `cache` so a page rendering several server components
 * resolves the session once per request.
 */
export const getSession = cache(async (): Promise<SessionContext | null> => {
  return resolveSession(await readSessionToken());
});

export async function getCurrentUser(): Promise<User | null> {
  return (await getSession())?.user ?? null;
}

/** Redirects to the login page, keeping the requested path for post-login return. */
export async function requireSession(): Promise<SessionContext> {
  const session = await getSession();
  if (!session) {
    const path = (await headers()).get('x-pathname') ?? '/';
    redirect(`/connexion?next=${encodeURIComponent(path)}`);
  }
  return session;
}

export async function requireUser(): Promise<User> {
  return (await requireSession()).user;
}

export async function requireAdmin(): Promise<User> {
  const user = await requireUser();
  if (user.role !== 'admin') redirect('/');
  return user;
}

/** Guard for Server Actions and Route Handlers: throws instead of redirecting. */
export class UnauthorizedError extends Error {
  constructor(message = 'Session invalide ou expirée') {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

export async function assertSession(): Promise<SessionContext> {
  const session = await getSession();
  if (!session) throw new UnauthorizedError();
  return session;
}

export async function assertAdmin(): Promise<SessionContext> {
  const session = await assertSession();
  if (session.user.role !== 'admin') {
    throw new UnauthorizedError('Action réservée aux administrateurs');
  }
  return session;
}

/** Best-effort client IP, honouring the reverse proxy headers. */
export async function getClientIp(): Promise<string> {
  const h = await headers();
  const forwarded = h.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]!.trim();
  return h.get('x-real-ip') ?? 'unknown';
}
