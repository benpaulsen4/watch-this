import { NextResponse } from 'next/server';

export async function POST() {
  try {
    const response = NextResponse.json({
      success: true,
      message: 'Signed out successfully',
    });

    // Clear session cookie
    response.cookies.delete('session');
    
    // Also clear any challenge cookies that might exist
    response.cookies.delete('registration-challenge');
    response.cookies.delete('authentication-challenge');

    return response;
  } catch (error) {
    console.error('Sign out error:', error);
    
    return NextResponse.json(
      { error: 'Failed to sign out' },
      { status: 500 }
    );
  }
}