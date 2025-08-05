import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth/webauthn';

// Define protected routes that require authentication
const protectedRoutes = [
  '/dashboard',
  '/lists',
  '/search',
  '/profile',
];

// Define public routes that should redirect to dashboard if authenticated
const publicRoutes = [
  '/auth',
  '/auth/register',
  '/auth/signin',
];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const sessionToken = request.cookies.get('session')?.value;

  // Check if user is authenticated
  const session = sessionToken ? await verifySessionToken(sessionToken) : null;
  const isAuthenticated = !!session;

  // Handle protected routes
  if (protectedRoutes.some(route => pathname.startsWith(route))) {
    if (!isAuthenticated) {
      // Redirect to auth page if not authenticated
      const authUrl = new URL('/auth', request.url);
      authUrl.searchParams.set('redirect', pathname);
      return NextResponse.redirect(authUrl);
    }
    
    // Add user info to headers for server components
    const response = NextResponse.next();
    response.headers.set('x-user-id', session.userId);
    response.headers.set('x-username', session.username);
    return response;
  }

  // Handle public routes (redirect to dashboard if authenticated)
  if (publicRoutes.some(route => pathname === route)) {
    if (isAuthenticated) {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }
  }

  // Handle root route
  if (pathname === '/') {
    if (isAuthenticated) {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    } else {
      return NextResponse.redirect(new URL('/auth', request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
};