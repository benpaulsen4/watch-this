import type { TMDBHttpError } from "@/lib/tmdb/client";

/** An error shaped like the TMDB client's non-2xx failures, for tests. */
export function tmdbError(status: number): TMDBHttpError {
  const error = new Error(`TMDB API error: ${status}`) as TMDBHttpError;
  error.status = status;
  return error;
}
