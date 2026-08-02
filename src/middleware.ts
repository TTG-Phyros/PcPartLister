import { NextResponse, type NextRequest } from 'next/server';

const SESSION_COOKIE = 'pcpl_session';

/** Everything else requires a session. Keep this list as short as possible. */
const PUBLIC_PATHS = ['/connexion', '/api/health'];

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * First line of defence, and only that: the Edge runtime cannot reach Postgres,
 * so this checks cookie *presence* to avoid a pointless render, while the real
 * validation happens in `requireSession()` / `assertSession()` on the Node side.
 * Nothing here is trusted as proof of authentication.
 */
export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  // Lets server components know where they are, for post-login redirection.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-pathname', `${pathname}${search}`);
  const pass = () => NextResponse.next({ request: { headers: requestHeaders } });

  if (isPublic(pathname)) return pass();
  if (request.cookies.has(SESSION_COOKIE)) return pass();

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  }

  const loginUrl = new URL('/connexion', request.url);
  if (pathname !== '/') loginUrl.searchParams.set('next', `${pathname}${search}`);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    // Everything except Next internals and static assets.
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|woff2?)$).*)',
  ],
};
