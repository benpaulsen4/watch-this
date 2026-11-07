import type { z } from "zod";

import type {
  AnyContract,
  ContractErrors,
  ContractResponse,
  ContractSchemasOf,
  Jsonify,
} from "./contract";
import {
  type ApiErrorBody,
  type ApiErrorIssue,
  type ClientErrorCode,
  UNIVERSAL_ERROR_STATUS,
  type UniversalErrorCode,
} from "./errors";

export class ApiError<Code extends string = string> extends Error {
  readonly code: Code;
  /** 0 when the request never got a response. */
  readonly status: number;
  readonly issues?: ApiErrorIssue[];

  constructor(
    code: Code,
    status: number,
    message: string,
    issues?: ApiErrorIssue[],
  ) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.issues = issues;
  }
}

export type ApiErrorCode<C extends AnyContract> =
  | Extract<keyof ContractErrors<C>, string>
  | UniversalErrorCode
  | ClientErrorCode;

type InputField<Key extends string, S> = S extends { [K in Key]: infer Schema }
  ? Schema extends z.ZodType
    ? undefined extends z.input<Schema>
      ? { [K in Key]?: z.input<Schema> }
      : Record<never, never> extends z.input<Schema>
        ? { [K in Key]?: z.input<Schema> }
        : { [K in Key]: z.input<Schema> }
    : object
  : object;

export type ApiInput<C extends AnyContract> = InputField<
  "params",
  ContractSchemasOf<C>
> &
  InputField<"query", ContractSchemasOf<C>> &
  InputField<"body", ContractSchemasOf<C>>;

export interface ApiInit {
  signal?: AbortSignal;
}

type ApiArgs<C extends AnyContract> =
  Record<never, never> extends ApiInput<C>
    ? [input?: ApiInput<C>, init?: ApiInit]
    : [input: ApiInput<C>, init?: ApiInit];

function buildUrl(
  path: string,
  params?: Record<string, unknown>,
  query?: Record<string, unknown>,
): string {
  const url = path.replace(/\[([^\]]+)\]/g, (_, name: string) =>
    encodeURIComponent(String(params?.[name])),
  );

  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined) continue;
    for (const item of Array.isArray(value) ? value : [value]) {
      search.append(key, String(item));
    }
  }

  const queryString = search.toString();
  return queryString ? `${url}?${queryString}` : url;
}

function isErrorBody(body: unknown): body is { error: string } & Partial<ApiErrorBody> {
  return (
    typeof body === "object" &&
    body !== null &&
    typeof (body as { error?: unknown }).error === "string"
  );
}

/**
 * Calls an endpoint and returns its parsed response, throwing `ApiError` on any
 * failure. The body is always read, even when unused or not JSON: an unread body
 * leaves the request open, and the page never goes network-idle.
 */
export async function api<C extends AnyContract>(
  contract: C,
  ...[input, init]: ApiArgs<C>
): Promise<Jsonify<ContractResponse<C>>> {
  const { params, query, body } = (input ?? {}) as {
    params?: Record<string, unknown>;
    query?: Record<string, unknown>;
    body?: unknown;
  };

  let response: Response;
  try {
    response = await fetch(buildUrl(contract.path, params, query), {
      method: contract.method,
      signal: init?.signal,
      ...(body === undefined
        ? {}
        : {
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }),
    });
  } catch (error) {
    // A cancelled query is not a failure; React Query expects to see the abort.
    if (init?.signal?.aborted) throw error;
    throw new ApiError("network", 0, "Could not reach the server");
  }

  const parsed: unknown = await response.json().catch((error: unknown) => {
    // An abort while reading the body is a cancellation too.
    if (init?.signal?.aborted) throw error;
    return undefined;
  });

  if (!response.ok) {
    if (isErrorBody(parsed)) {
      throw new ApiError(
        parsed.code ?? "invalidResponse",
        response.status,
        parsed.error,
        parsed.issues,
      );
    }
    throw new ApiError(
      "invalidResponse",
      response.status,
      `${contract.label} failed`,
    );
  }

  if (parsed === undefined) {
    throw new ApiError(
      "invalidResponse",
      response.status,
      `${contract.label} failed`,
    );
  }

  return parsed as Jsonify<ContractResponse<C>>;
}

/** Narrows `error` to an `ApiError` from this contract, for branching on `code`. */
export function isApiError<C extends AnyContract>(
  error: unknown,
  contract: C,
): error is ApiError<ApiErrorCode<C>> {
  if (!(error instanceof ApiError)) return false;
  return (
    error.code === "network" ||
    error.code === "invalidResponse" ||
    error.code in UNIVERSAL_ERROR_STATUS ||
    (contract.errors !== undefined && error.code in contract.errors)
  );
}

export function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

/** React Query retry default: once, except for 4xx, which a retry cannot fix. */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
    return false;
  }
  return failureCount < 1;
}
