import { NextResponse, type NextRequest } from 'next/server';

const PUBLIC = ['/login', '/register', '/terms', '/privacy'];

/** Redirects to sign-in when there is no session cookie. The API still validates every request. */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return NextResponse.next();
  if (!req.cookies.get('ch_session')) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.search = pathname === '/' ? '' : `?next=${encodeURIComponent(pathname)}`;
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next|favicon.ico|icon.svg).*)'],
};
