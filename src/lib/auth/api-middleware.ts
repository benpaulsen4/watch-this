import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/webauthn';

export interface AuthenticatedRequest extends NextRequest {
  user: {
    id: string;
    username: string;
    createdAt: Date;
  };
}

export type AuthenticatedHandler = (
  request: AuthenticatedRequest
) => Promise<NextResponse> | NextResponse;

/**
 * Higher-order function that wraps API route handlers with authentication
 * @param handler - The API route handler that requires authentication
 * @returns A wrapped handler that checks authentication before proceeding
 */
export function withAuth(handler: AuthenticatedHandler) {
  return async function (request: NextRequest): Promise<NextResponse> {
    try {
      // Check authentication
      const sessionToken = request.cookies.get('session')?.value;
      
      if (!sessionToken) {
        return NextResponse.json(
          { error: 'Authentication required' },
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

      // Add user to request object
      const authenticatedRequest = request as AuthenticatedRequest;
      authenticatedRequest.user = {
        id: user.id,
        username: user.username,
        createdAt: user.createdAt,
      };

      return await handler(authenticatedRequest);
    } catch (error) {
      console.error('Authentication middleware error:', error);
      return NextResponse.json(
        { error: 'Authentication failed' },
        { status: 500 }
      );
    }
  };
}

/**
 * Utility function to handle common API errors
 * @param error - The error object
 * @param context - Context for logging (e.g., 'TMDB search')
 * @returns NextResponse with appropriate error message and status
 */
export function handleApiError(error: unknown, context: string): NextResponse {
  console.error(`${context} error:`, error);

  if (error instanceof Error) {
    if (error.message.includes('TMDB API error')) {
      return NextResponse.json(
        { error: 'External service unavailable' },
        { status: 503 }
      );
    }
    
    if (error.message.includes('rate limit')) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please try again later.' },
        { status: 429 }
      );
    }
  }

  return NextResponse.json(
    { error: `${context} failed` },
    { status: 500 }
  );
}

/**
 * Utility function to validate pagination parameters
 * @param page - Page number from query params
 * @param maxPage - Maximum allowed page number (default: 1000)
 * @returns Validation result with page number or error response
 */
export function validatePagination(
  page: string | null,
  maxPage: number = 1000
): { page: number; error?: NextResponse } {
  const pageNum = parseInt(page || '1');
  
  if (isNaN(pageNum) || pageNum < 1 || pageNum > maxPage) {
    return {
      page: 1,
      error: NextResponse.json(
        { error: `Page must be between 1 and ${maxPage}` },
        { status: 400 }
      ),
    };
  }
  
  return { page: pageNum };
}