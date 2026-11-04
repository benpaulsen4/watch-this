const RESUME_REFETCH_AGE_MS = 60_000;

/**
 * A `refetchOnWindowFocus` for queries showing other people's activity. The
 * installed app resumes rather than reloads, so without this a friend's activity
 * stays hidden until the next navigation.
 *
 * Opt in per query, not as a client default. A consumer has to tolerate a
 * background refetch failing while it still holds data: check `error` only when
 * there is no data, and throw on a bad response rather than caching its body.
 *
 * Age counts from the last attempt, failed or not. A query that has never
 * succeeded has `dataUpdatedAt` 0, so judging by data alone would re-request it
 * on every app switch.
 */
export function refetchOnResume(query: {
  state: { dataUpdatedAt: number; errorUpdatedAt: number };
}): boolean {
  const lastAttemptAt = Math.max(
    query.state.dataUpdatedAt,
    query.state.errorUpdatedAt,
  );
  return Date.now() - lastAttemptAt > RESUME_REFETCH_AGE_MS;
}
