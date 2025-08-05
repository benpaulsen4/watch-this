import { NextRequest, NextResponse } from 'next/server';
import { generatePasskeyAuthenticationOptions } from '@/lib/auth/webauthn';

interface RequestBody {
  username?: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: RequestBody = await request.json();
    const { username } = body;

    // Validate username if provided
    if (username && (typeof username !== 'string' || username.trim().length === 0)) {
      return NextResponse.json(
        { error: 'Invalid username' },
        { status: 400 }
      );
    }

    const options = await generatePasskeyAuthenticationOptions(
      username ? username.trim() : undefined
    );
    
    const response = NextResponse.json({
      options,
      challenge: options.challenge,
    });

    // Set challenge in httpOnly cookie for security
    response.cookies.set('authentication-challenge', options.challenge, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 5 * 60, // 5 minutes
      path: '/api/auth/authenticate',
    });

    return response;
  } catch (error) {
    console.error('Authentication begin error:', error);
    
    return NextResponse.json(
      { error: 'Failed to generate authentication options' },
      { status: 500 }
    );
  }
}