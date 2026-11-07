import { NextRequest, NextResponse } from "next/server";

import type { ApiErrorBody } from "@/lib/api/errors";
import { getCurrentUser } from "@/lib/auth/webauthn";
import { isTMDBHttpError } from "@/lib/tmdb/client";

import { User } from "../db";

export interface AuthenticatedRequest extends NextRequest {
  user: User;
}

/** The App Router's second handler argument. Next resolves `params` from the path. */
export interface RouteContext {
  params: Promise<Record<string, string | string[] | undefined>>;
}

export type AuthenticatedHandler = (
  request: AuthenticatedRequest,
  context: RouteContext,
) => Promise<NextResponse> | NextResponse;

const NO_PARAMS: RouteContext = { params: Promise.resolve({}) };

/**
 * Higher-order function that wraps API route handlers with authentication
 * @param handler - The API route handler that requires authentication
 * @returns A wrapped handler that checks authentication before proceeding
 */
export function withAuth(handler: AuthenticatedHandler) {
  return async function (
    request: NextRequest,
    context: RouteContext = NO_PARAMS,
  ): Promise<NextResponse> {
    try {
      // Check authentication
      const sessionToken = request.cookies.get("session")?.value;

      if (!sessionToken) {
        return NextResponse.json(
          { error: "Authentication required", code: "unauthenticated" },
          { status: 401 },
        );
      }

      const user = await getCurrentUser(sessionToken);

      if (!user) {
        // Clear invalid session cookie
        const response = NextResponse.json(
          { error: "Invalid session", code: "invalidSession" },
          { status: 401 },
        );
        response.cookies.delete("session");
        return response;
      }

      // Add user to request object
      const authenticatedRequest = request as AuthenticatedRequest;
      authenticatedRequest.user = user;

      return await handler(authenticatedRequest, context);
    } catch (error) {
      console.error("Authentication middleware error:", error);
      return NextResponse.json(
        { error: "Authentication failed", code: "internal" },
        { status: 500 },
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

  if (isTMDBHttpError(error)) {
    if (error.status === 429) {
      return NextResponse.json(
        {
          error: "Rate limit exceeded. Please try again later.",
          code: "rateLimited",
        } satisfies ApiErrorBody,
        { status: 429 },
      );
    }

    return NextResponse.json(
      {
        error: "External service unavailable",
        code: "upstreamUnavailable",
      } satisfies ApiErrorBody,
      { status: 503 },
    );
  }

  return NextResponse.json(
    { error: `${context} failed`, code: "internal" } satisfies ApiErrorBody,
    { status: 500 },
  );
}
