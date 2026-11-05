import type { z } from "zod";

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export type ErrorMap = Record<string, { status: number; message: string }>;

/** The Zod schemas for one endpoint. They live in the feature's `schemas.ts`. */
export interface ContractSchemas {
  params?: z.ZodType;
  query?: z.ZodType;
  body?: z.ZodType;
}

type NoSchemas = Record<never, never>;

declare const marker: unique symbol;

/** Carries a type through a contract. Erased at runtime, so nothing here costs bytes. */
export interface TypeMarker<T> {
  readonly [marker]?: T;
}

/** `T` must be an object or array, so a handler's returned string is always an error code. */
export function type<T extends object>(): TypeMarker<T> {
  return {};
}

/**
 * Points a contract at its schemas by type alone: `schemas<typeof addSchedule>()`
 * with an `import type`. Zod stays out of the client bundle, where it would add
 * about 55 KB gzipped to run validators the client never calls.
 */
export function schemas<S extends ContractSchemas>(): TypeMarker<S> {
  return {};
}

/** The `[segment]` names in a route path, as a union. */
export type PathParamNames<Path extends string> =
  Path extends `${string}[${infer Name}]${infer Rest}`
    ? Name | PathParamNames<Rest>
    : never;

/** Rejects a contract whose `params` schema does not cover its path's segments. */
type ParamsMatchPath<Path extends string, S extends ContractSchemas> = [
  PathParamNames<Path>,
] extends [never]
  ? S extends { params: z.ZodType }
    ? { schemas: never }
    : unknown
  : S extends {
        params: z.ZodType<unknown, Record<PathParamNames<Path>, string>>;
      }
    ? unknown
    : { schemas: never };

export interface ApiContract<
  Path extends string = string,
  Response extends object = object,
  S extends ContractSchemas = ContractSchemas,
  Errors extends ErrorMap = ErrorMap,
> {
  method: HttpMethod;
  path: Path;
  /** Names the operation in logs and in the 500 message: `${label} failed`. */
  label: string;
  schemas?: TypeMarker<S>;
  response: TypeMarker<Response>;
  /** Success status. Defaults to 200. */
  status?: number;
  errors?: Errors;
}

export function defineContract<
  Path extends string,
  Response extends object,
  S extends ContractSchemas = NoSchemas,
  Errors extends ErrorMap = NoSchemas,
>(
  contract: ApiContract<Path, Response, S, Errors> & ParamsMatchPath<Path, S>,
): ApiContract<Path, Response, S, Errors> {
  return contract;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the widest contract; fields are read through the helpers below
export type AnyContract = ApiContract<string, any, any, any>;

export type ContractResponse<C> =
  C extends ApiContract<string, infer Response, infer _S, infer _E>
    ? Response
    : never;

export type ContractSchemasOf<C> =
  C extends ApiContract<string, infer _R, infer S, infer _E> ? S : never;

export type ContractErrors<C> =
  C extends ApiContract<string, infer _R, infer _S, infer Errors>
    ? Errors
    : never;

/** What a response type looks like after `JSON.stringify` and `JSON.parse`. */
export type Jsonify<T> = T extends Date
  ? string
  : T extends (infer Item)[]
    ? Jsonify<Item>[]
    : T extends object
      ? { [Key in keyof T]: Jsonify<T[Key]> }
      : T;
