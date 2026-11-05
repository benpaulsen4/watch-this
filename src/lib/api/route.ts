import { NextRequest, NextResponse } from "next/server";
import type { z } from "zod";

import {
  type AuthenticatedRequest,
  handleApiError,
  type RouteContext,
  withAuth,
} from "@/lib/auth/api-middleware";

import type { User } from "../db";
import type {
  AnyContract,
  ContractErrors,
  ContractResponse,
  ContractSchemas,
  ContractSchemasOf,
} from "./contract";
import type { ApiErrorBody, ApiErrorIssue } from "./errors";
import { UNIVERSAL_ERROR_STATUS } from "./errors";
import { searchParamsToObject } from "./query";

type Output<S> = S extends z.ZodType ? z.output<S> : undefined;

type RouteInputs<S> = {
  request: NextRequest;
  params: Output<S extends { params: infer P } ? P : undefined>;
  query: Output<S extends { query: infer Q } ? Q : undefined>;
  body: Output<S extends { body: infer B } ? B : undefined>;
};

/** An object or array becomes JSON; a string is an error code; a NextResponse passes through. */
type HandlerResult<C> =
  | ContractResponse<C>
  | Extract<keyof ContractErrors<C>, string>
  | NextResponse;

type MaybePromise<T> = T | Promise<T>;

export interface RouteOptions {
  /** Applied to every response, including 401s and errors. */
  headers?: Record<string, string>;
}

type RouteHandler = (
  request: NextRequest,
  context?: RouteContext,
) => Promise<NextResponse>;

const NO_PARAMS: RouteContext = { params: Promise.resolve({}) };

function validationFailure(issues: ApiErrorIssue[]): NextResponse {
  const body: ApiErrorBody = {
    error: issues[0]?.message ?? "Invalid request",
    code: "validation",
    issues,
  };
  return NextResponse.json(body, { status: UNIVERSAL_ERROR_STATUS.validation });
}

function toIssues(error: z.ZodError): ApiErrorIssue[] {
  return error.issues.map((issue) => ({
    path: issue.path.map(String).join("."),
    message: issue.message,
  }));
}

type ParsedInputs = Record<"params" | "query" | "body", unknown>;

/** Validates params, then query, then body. Returns a response on the first failure. */
async function parseInputs(
  schemas: ContractSchemas,
  request: NextRequest,
  context: RouteContext,
): Promise<ParsedInputs | NextResponse> {
  const inputs: ParsedInputs = {
    params: undefined,
    query: undefined,
    body: undefined,
  };

  if (schemas.params) {
    const result = schemas.params.safeParse(await context.params);
    if (!result.success) return validationFailure(toIssues(result.error));
    inputs.params = result.data;
  }

  if (schemas.query) {
    const result = schemas.query.safeParse(
      searchParamsToObject(request.nextUrl.searchParams),
    );
    if (!result.success) return validationFailure(toIssues(result.error));
    inputs.query = result.data;
  }

  if (schemas.body) {
    let json: unknown;
    try {
      json = await request.json();
    } catch {
      return validationFailure([
        { path: "", message: "Request body must be valid JSON" },
      ]);
    }
    const result = schemas.body.safeParse(json);
    if (!result.success) return validationFailure(toIssues(result.error));
    inputs.body = result.data;
  }

  return inputs;
}

function toResponse(contract: AnyContract, result: unknown): NextResponse {
  if (result instanceof NextResponse) return result;

  if (typeof result === "string") {
    const declared = contract.errors?.[result];
    // Only reachable through a cast: the handler's return type rules it out.
    if (!declared) throw new Error(`Undeclared error code: ${result}`);
    const body: ApiErrorBody = { error: declared.message, code: result };
    return NextResponse.json(body, { status: declared.status });
  }

  return NextResponse.json(result, { status: contract.status ?? 200 });
}

async function run(
  contract: AnyContract,
  schemas: ContractSchemas,
  request: NextRequest,
  context: RouteContext,
  call: (inputs: ParsedInputs & { request: NextRequest }) => unknown,
): Promise<NextResponse> {
  try {
    const inputs = await parseInputs(schemas, request, context);
    if (inputs instanceof NextResponse) return inputs;
    return toResponse(contract, await call({ ...inputs, request }));
  } catch (error) {
    return handleApiError(error, contract.label);
  }
}

function withHeaders(
  handler: RouteHandler,
  options?: RouteOptions,
): RouteHandler {
  if (!options?.headers) return handler;
  const headers = Object.entries(options.headers);
  return async (request, context) => {
    const response = await handler(request, context);
    for (const [name, value] of headers) response.headers.set(name, value);
    return response;
  };
}

/** A route for signed-in users. Auth runs first, so anonymous callers learn nothing about the inputs. */
export function authedRoute<
  C extends AnyContract,
  S extends ContractSchemasOf<C>,
>(
  contract: C,
  schemas: S,
  handler: (
    inputs: RouteInputs<S> & { user: User },
  ) => MaybePromise<HandlerResult<C>>,
  options?: RouteOptions,
): RouteHandler {
  const authenticated = withAuth(
    (request: AuthenticatedRequest, context: RouteContext) =>
      run(contract, schemas, request, context, (inputs) =>
        handler({ ...inputs, user: request.user } as RouteInputs<S> & {
          user: User;
        }),
      ),
  );
  return withHeaders(authenticated, options);
}

/** A route with no session requirement. Any auth it needs is the handler's job. */
export function publicRoute<
  C extends AnyContract,
  S extends ContractSchemasOf<C>,
>(
  contract: C,
  schemas: S,
  handler: (inputs: RouteInputs<S>) => MaybePromise<HandlerResult<C>>,
  options?: RouteOptions,
): RouteHandler {
  return withHeaders(
    (request, context = NO_PARAMS) =>
      run(contract, schemas, request, context, (inputs) =>
        handler(inputs as RouteInputs<S>),
      ),
    options,
  );
}
