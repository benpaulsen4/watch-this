/**
 * Unwraps the single row from a Drizzle result array that the query guarantees
 * is non-empty.
 *
 * With `noUncheckedIndexedAccess` enabled, `const [row] = await db.insert(...)
 * .returning()` types `row` as `T | undefined`, because TypeScript cannot know
 * how many rows the statement produced. For an unconditional single-row
 * `insert().returning()` or `update()` on a row already proven to exist, an
 * empty array is not reachable: postgres either returns the row or the driver
 * throws.
 *
 * Use this instead of a non-null assertion so that if the "impossible" case
 * ever does happen, the failure is a named error at the point of the bad
 * assumption rather than a `Cannot read properties of undefined` several lines
 * later. Do NOT use it where an empty result is genuinely reachable --
 * `onConflictDoNothing().returning()`, `select().limit(1)`, or an update whose
 * target may have been deleted concurrently. Those need real handling.
 *
 * @param rows The result array from a Drizzle query.
 * @param context Short description of the statement, used in the error message.
 */
export function expectRow<T>(rows: readonly T[], context: string): T {
  const row = rows[0];
  if (row === undefined) {
    throw new Error(`${context}: expected one row, got none`);
  }
  return row;
}
