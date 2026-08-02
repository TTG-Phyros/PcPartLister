import { NextResponse } from 'next/server';
import { assertSession } from '@/lib/auth/guard';
import { readSessionToken, setSessionCookie } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

/**
 * Rolls the session forward. `assertSession()` already slid the database expiry;
 * this re-issues the cookie with a fresh Max-Age so an actively used session
 * never expires client-side either.
 *
 * A Route Handler is the only place that can both read the database and write a
 * cookie — middleware runs on the Edge with no database access, and server
 * components are not allowed to set cookies.
 */
export async function POST() {
  try {
    await assertSession();
  } catch {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  }

  const token = await readSessionToken();
  if (token) await setSessionCookie(token);
  return NextResponse.json({ refreshed: true });
}
