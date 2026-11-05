/** Failure codes any route can return, whatever its contract declares. */
export const UNIVERSAL_ERROR_STATUS = {
  validation: 400,
  unauthenticated: 401,
  invalidSession: 401,
  rateLimited: 429,
  internal: 500,
  upstreamUnavailable: 503,
} as const;

export type UniversalErrorCode = keyof typeof UNIVERSAL_ERROR_STATUS;

/** Failures that never produce an `ApiErrorBody`, so only the client sees them. */
export type ClientErrorCode = "network" | "invalidResponse";

export interface ApiErrorIssue {
  path: string;
  message: string;
}

export interface ApiErrorBody {
  error: string;
  code: string;
  issues?: ApiErrorIssue[];
}
