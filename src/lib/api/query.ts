import { z } from "zod";

/**
 * Converts search params for validation: `?x=` counts as absent, matching the
 * routes' `if (param)` checks, and a repeated key becomes an array.
 */
export function searchParamsToObject(
  searchParams: URLSearchParams,
): Record<string, string | string[]> {
  const result: Record<string, string | string[]> = {};
  for (const key of new Set(searchParams.keys())) {
    const values = searchParams.getAll(key).filter((value) => value !== "");
    if (values.length === 1) result[key] = values[0]!;
    else if (values.length > 1) result[key] = values;
  }
  return result;
}

const DROPPED = Symbol("dropped");

/**
 * Helpers for query strings. For an optional param with a default that also
 * tolerates bad values (such as `sortOrder`), use
 * `z.enum([...]).default("x").catch("x")`. A bare `.catch()` leaves the key
 * required in `z.input`, so `api()` would demand it, and `.optional().catch()`
 * returns undefined for a missing value because `.optional()` accepts it first.
 */
export const q = {
  /**
   * A whole number in a query string. Only digit strings pass: `parseInt` would
   * read `12abc` as 12, and `z.coerce.number()` would read an empty string as 0.
   * Numbers are accepted so callers of `api()` can pass them directly.
   */
  int({
    min,
    max,
    message = "Must be a whole number",
  }: { min?: number; max?: number; message?: string } = {}) {
    return z
      .union([z.string(), z.number()], { error: message })
      .transform((value, context) => {
        const text = String(value);
        const parsed = Number(text);
        if (
          !/^\d+$/.test(text) ||
          !Number.isSafeInteger(parsed) ||
          (min !== undefined && parsed < min) ||
          (max !== undefined && parsed > max)
        ) {
          context.addIssue({ code: "custom", message });
          return z.NEVER;
        }
        return parsed;
      });
  },

  /**
   * One value or many, always output as an array. The array form is tried
   * first: a catching element schema would otherwise accept a whole array as
   * one invalid value. With `dropInvalid`, elements that fail the schema are
   * dropped instead of failing the query, which keeps a list route lenient.
   */
  list<S extends z.ZodType>(
    schema: S,
    { dropInvalid = false }: { dropInvalid?: boolean } = {},
  ) {
    // An invalid element becomes the marker, which the transform removes.
    const element = dropInvalid ? schema.catch(DROPPED as never) : schema;
    return z.union([z.array(element), element]).transform(
      (value) =>
        (Array.isArray(value) ? value : [value]).filter(
          (item) => item !== DROPPED,
        ) as z.output<S>[],
    );
  },
};
