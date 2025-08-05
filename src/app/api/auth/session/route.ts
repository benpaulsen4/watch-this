import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/webauthn';

export async function GET(request: NextRequest) {
  try {
    const sessionToken = request.cookies.get('session')?.value;
    
    if (!sessionToken) {
      return NextResponse.json(
        { error: 'No session found' },
        { status: 401 }
      );
    }

    const user = await getCurrentUser(sessionToken);
    
    if (!user) {
      // Clear invalid session cookie
      const response = NextResponse.json(
        { error: 'Invalid session' },
        { status: 401 }
      );
      response.cookies.delete('session');
      return response;
    }

    return NextResponse.json({
      user: {
        id: user.id,
        username: user.username,
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    console.error('Session check error:', error);
    
    return NextResponse.json(
      { error: 'Failed to check session' },
      { status: 500 }
    );
  }
}