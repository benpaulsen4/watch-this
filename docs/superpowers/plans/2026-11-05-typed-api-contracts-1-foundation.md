# Typed API Contracts: Foundation and Schedules Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the contract, route wrapper, and typed client, and prove them by migrating `/api/schedules` and its one caller. This is PR 1 of the 8 in the spec's rollout.

**Architecture:** Each endpoint has a client-safe contract (`src/lib/<feature>/contract.ts`) holding its method, path, and error codes, plus server-only Zod schemas (`schemas.ts`) that the contract references by type alone. `authedRoute` and `publicRoute` validate input and turn handler results into responses. `api()` calls an endpoint from the client with full types and throws a typed `ApiError`.

**Tech Stack:** Next.js 16 App Router, TypeScript, Zod 4, React Query 5, Vitest, ESLint flat config, pnpm.

**Spec:** `docs/superpowers/specs/2026-11-05-typed-api-contracts-design.md`

## Global Constraints

- URLs, HTTP methods, and success response shapes do not change.
- Every error body keeps `error` and adds `code`: `{ error: string; code: string; issues?: { path: string; message: string }[] }`.
- Client-bundled code never imports `zod` or a `schemas.ts` at runtime; `import type` is fine. Total growth of `.next/static/chunks/*.js` stays under 10 kB gzipped against the 507,379-byte baseline.
- Contract files never import `@/lib/db`, services, `next/server`, or auth server modules. `@/lib/db/schema` is allowed.
- Do not use `zod/mini`: measured, it does not reduce the bundle.
- `withAuth` stays. Existing routes keep working unchanged, including tests that call them with only a request.
- All code below compiled and passed on a prototype on 2026-11-05 (Next 16.3.8, 1,492 tests). If something fails, the tree has probably drifted, so investigate instead of weakening a test or a type.

## File Structure

| File | Responsibility |
| --- | --- |
| `src/lib/api/errors.ts` (new) | Universal error codes and the error body type |
| `src/lib/api/contract.ts` (new) | `defineContract`, `type<T>()`, `schemas<S>()`, `Jsonify`; no runtime Zod |
| `src/lib/api/query.ts` (new) | `q.int`, `q.list`, `searchParamsToObject`; server only |
| `src/lib/api/route.ts` (new) | `authedRoute`, `publicRoute`; server only |
| `src/lib/api/client.ts` (new) | `api`, `ApiError`, `isApiError`, `errorMessage`, `shouldRetry` |
| `src/lib/auth/api-middleware.ts` | Forward route context; add error codes; check TMDB errors by status |
| `src/proxy.ts` | Add `code` to the rate-limit response |
| `src/components/providers/ReactQueryProvider.tsx` | Retry default |
| `src/lib/schedules/schemas.ts`, `contract.ts` (new) | The schedules endpoints |
| `src/app/api/schedules/route.ts` | Rewritten on `authedRoute` |
| `src/components/content/ScheduleManager.tsx` | Calls `api()` |
| `eslint.config.mjs` | Keeps schemas and server modules out of client code |
| `docs/api/openapi.yaml` | Documents `code` and `issues` |

Setup: this worktree needs `pnpm install --frozen-lockfile` before anything else.

---

### Task 1: Error codes, contract, and query helpers

**Files:**
- Modify: `package.json`, `pnpm-lock.yaml`
- Create: `src/lib/api/errors.ts`, `src/lib/api/contract.ts`, `src/lib/api/query.ts`
- Test: `src/lib/api/query.test.ts`

**Interfaces:**
- Produces: `UNIVERSAL_ERROR_STATUS`, `UniversalErrorCode`, `ClientErrorCode`, `ApiErrorIssue`, `ApiErrorBody` (errors.ts). `defineContract`, `type`, `schemas`, `ApiContract`, `AnyContract`, `ContractSchemas`, `ContractResponse`, `ContractSchemasOf`, `ContractErrors`, `Jsonify` (contract.ts). `q.int`, `q.list`, `searchParamsToObject` (query.ts).

- [ ] **Step 1: Add Zod as a direct dependency**

Run: `pnpm add zod@^4.1.12`
Expected: `package.json` gains `"zod": "^4.1.12"`; the lockfile gains the direct entry only.

- [ ] **Step 2: Write the failing test**

Create `src/lib/api/query.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { q, searchParamsToObject } from "./query";

describe("searchParamsToObject", () => {
  it("treats an empty value as absent", () => {
    expect(searchParamsToObject(new URLSearchParams("x=&y=1"))).toEqual({
      y: "1",
    });
  });

  it("turns a repeated key into an array", () => {
    expect(searchParamsToObject(new URLSearchParams("x=1&x=2"))).toEqual({
      x: ["1", "2"],
    });
  });
});

describe("q.int", () => {
  const schema = q.int({ min: 1, max: 10, message: "Bad number" });

  it.each([
    ["7", 7],
    ["1", 1],
    ["10", 10],
    [7, 7],
  ])("accepts %s", (input, expected) => {
    expect(schema.parse(input)).toBe(expected);
  });

  it.each(["12abc", "2.5", "", "-1", "0", "11", "abc", 2.5, null])(
    "rejects %s with the given message",
    (input) => {
      const result = schema.safeParse(input);
      expect(result.success).toBe(false);
      expect(result.error?.issues[0]?.message).toBe("Bad number");
    },
  );

  it("can be optional", () => {
    expect(schema.optional().parse(undefined)).toBeUndefined();
  });
});

describe("q.list", () => {
  const schema = q.list(z.enum(["a", "b"]));

  it("wraps one value in an array", () => {
    expect(schema.parse("a")).toEqual(["a"]);
  });

  it("keeps many values", () => {
    expect(schema.parse(["a", "b"])).toEqual(["a", "b"]);
  });

  it("rejects a value outside the schema", () => {
    expect(schema.safeParse(["a", "c"]).success).toBe(false);
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `pnpm exec vitest run src/lib/api/query.test.ts`
Expected: FAIL, cannot resolve `./query`.

- [ ] **Step 4: Create the three modules**

Create `src/lib/api/errors.ts`:

```ts
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
```

Create `src/lib/api/contract.ts`. Its only Zod import is `import type`, which is what keeps Zod out of the client bundle:

```ts
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
```

Create `src/lib/api/query.ts`:

```ts
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
          (min !== undefined && parsed < min) ||
          (max !== undefined && parsed > max)
        ) {
          context.addIssue({ code: "custom", message });
          return z.NEVER;
        }
        return parsed;
      });
  },

  /** One value or many, always output as an array. */
  list<S extends z.ZodType>(schema: S) {
    return z
      .union([schema, z.array(schema)])
      .transform(
        (value) => (Array.isArray(value) ? value : [value]) as z.output<S>[],
      );
  },
};
```

- [ ] **Step 5: Run the test and typecheck**

Run: `pnpm exec vitest run src/lib/api/query.test.ts && pnpm typecheck`
Expected: all PASS, no type errors.

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml src/lib/api
git commit -m "feat: add API contract types and query helpers"
```

---

### Task 2: `withAuth` context, error codes, and TMDB status checks

**Files:**
- Modify: `src/lib/auth/api-middleware.ts`, `src/proxy.ts`
- Test: `src/lib/auth/api-middleware.test.ts`

**Interfaces:**
- Consumes: `ApiErrorBody` from `@/lib/api/errors`; `isTMDBHttpError` from `@/lib/tmdb/client` (already exists).
- Produces: `RouteContext` (`{ params: Promise<Record<string, string | string[] | undefined>> }`). `AuthenticatedHandler` becomes `(request, context: RouteContext)`. `withAuth(handler)` returns `(request, context?: RouteContext)`, so existing one-argument handlers and tests still work. `handleApiError(error, context)` keeps its signature and adds `code`.

This fixes a real bug. A TMDB 429 has the message `TMDB API error: 429 ...`, which today hits the 503 branch, so the documented 429 is unreachable.

- [ ] **Step 1: Write the failing test**

Create `src/lib/auth/api-middleware.test.ts`:

```ts
// @vitest-environment node
import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { TMDBHttpError } from "@/lib/tmdb/client";

vi.mock("@/lib/auth/webauthn", () => ({
  getCurrentUser: vi.fn(async (token?: string) => {
    if (token === "throw") throw new Error("db down");
    return token === "valid" ? { id: "user-1" } : null;
  }),
}));

const { handleApiError, withAuth } = await import("./api-middleware");

function tmdbError(status: number): TMDBHttpError {
  const error = new Error(`TMDB API error: ${status} Nope`) as TMDBHttpError;
  error.status = status;
  return error;
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("handleApiError", () => {
  it("returns 429 rateLimited for a TMDB 429", async () => {
    const response = handleApiError(tmdbError(429), "Search");
    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toEqual({
      error: "Rate limit exceeded. Please try again later.",
      code: "rateLimited",
    });
  });

  it.each([404, 500, 503])(
    "returns 503 upstreamUnavailable for a TMDB %i",
    async (status) => {
      const response = handleApiError(tmdbError(status), "Search");
      expect(response.status).toBe(503);
      await expect(response.json()).resolves.toEqual({
        error: "External service unavailable",
        code: "upstreamUnavailable",
      });
    },
  );

  it("returns 500 internal with the context for anything else", async () => {
    const response = handleApiError(new Error("boom"), "Search");
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Search failed",
      code: "internal",
    });
  });
});

describe("withAuth", () => {
  const request = (session?: string) =>
    new NextRequest("http://localhost/api/x", {
      headers: session ? { cookie: `session=${session}` } : {},
    });

  it("forwards the route context to the handler", async () => {
    const handler = withAuth(async (_request, context) =>
      NextResponse.json(await context.params),
    );
    const response = await handler(request("valid"), {
      params: Promise.resolve({ id: "abc" }),
    });
    await expect(response.json()).resolves.toEqual({ id: "abc" });
  });

  it("gives the handler empty params when called with only a request", async () => {
    const handler = withAuth(async (_request, context) =>
      NextResponse.json(await context.params),
    );
    const response = await handler(request("valid"));
    await expect(response.json()).resolves.toEqual({});
  });

  it("adds a code to each auth failure", async () => {
    const handler = withAuth(() => NextResponse.json({}));

    const missing = await handler(request());
    expect(await missing.json()).toEqual({
      error: "Authentication required",
      code: "unauthenticated",
    });

    const invalid = await handler(request("bad"));
    expect(invalid.status).toBe(401);
    expect(await invalid.json()).toEqual({
      error: "Invalid session",
      code: "invalidSession",
    });
    expect(invalid.cookies.get("session")?.value).toBe("");

    const failed = await handler(request("throw"));
    expect(failed.status).toBe(500);
    expect(await failed.json()).toEqual({
      error: "Authentication failed",
      code: "internal",
    });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm exec vitest run src/lib/auth/api-middleware.test.ts`
Expected: FAIL. The TMDB 429 test gets 503, and bodies lack `code`.

- [ ] **Step 3: Update the middleware**

Replace `src/lib/auth/api-middleware.ts` with:

```ts
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

/**
 * Utility function to validate pagination parameters
 * @param page - Page number from query params
 * @param maxPage - Maximum allowed page number (default: 1000)
 * @returns Validation result with page number or error response
 */
export function validatePagination(
  page: string | null,
  maxPage: number = 1000,
): { page: number; error?: NextResponse } {
  const pageNum = parseInt(page || "1");

  if (isNaN(pageNum) || pageNum < 1 || pageNum > maxPage) {
    return {
      page: 1,
      error: NextResponse.json(
        { error: `Page must be between 1 and ${maxPage}` },
        { status: 400 },
      ),
    };
  }

  return { page: pageNum };
}
```

- [ ] **Step 4: Add the code to the proxy's rate-limit response**

Apply to `src/proxy.ts`:

```diff
diff --git a/src/proxy.ts b/src/proxy.ts
index a761e81..927806a 100644
--- a/src/proxy.ts
+++ b/src/proxy.ts
@@ -99,7 +99,7 @@ export function proxy(request: NextRequest) {
 
   if (!result.allowed) {
     return NextResponse.json(
-      { error: "Too many requests" },
+      { error: "Too many requests", code: "rateLimited" },
       {
         status: 429,
         headers: { "Retry-After": String(result.retryAfter) },
```

- [ ] **Step 5: Run the tests and typecheck**

Run: `pnpm exec vitest run src/lib/auth/api-middleware.test.ts src/proxy.test.ts && pnpm typecheck`
Expected: all PASS, no type errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/auth/api-middleware.ts src/lib/auth/api-middleware.test.ts src/proxy.ts
git commit -m "fix: return 429 for TMDB rate limits and add error codes"
```

---

### Task 3: Route wrapper

**Files:**
- Create: `src/lib/api/route.ts`
- Test: `src/lib/api/route.test.ts`

**Interfaces:**
- Consumes: `withAuth`, `handleApiError`, `RouteContext`, `AuthenticatedRequest` (Task 2). `AnyContract`, `ContractSchemas`, `ContractSchemasOf`, `ContractResponse`, `ContractErrors` (Task 1). `searchParamsToObject` (Task 1).
- Produces: `authedRoute(contract, schemas, handler, options?)` and `publicRoute(contract, schemas, handler, options?)`, each returning `(request, context?) => Promise<NextResponse>`. A handler receives `{ request, params, query, body }`, plus `user` on `authedRoute`, and returns the contract's response, a declared error code string, or a `NextResponse`. `RouteOptions` is `{ headers?: Record<string, string> }`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/api/route.test.ts`:

```ts
// @vitest-environment node
import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { defineContract, schemas, type } from "./contract";
import { q } from "./query";

vi.mock("@/lib/auth/webauthn", () => ({
  getCurrentUser: vi.fn(async (token?: string) =>
    token === "valid" ? { id: "user-1" } : null,
  ),
}));

const { authedRoute, publicRoute } = await import("./route");

const thingSchemas = {
  params: z.object({ id: z.string().min(2, "Bad id") }),
  query: z.object({ page: q.int({ message: "Bad page" }).optional() }),
  body: z.object({ name: z.string("Name is required") }),
};

const postThing = defineContract({
  method: "POST",
  path: "/api/things/[id]",
  label: "Post thing",
  status: 201,
  schemas: schemas<typeof thingSchemas>(),
  response: type<{ id: string; page?: number; name: string; userId?: string }>(),
  errors: { conflict: { status: 409, message: "Already exists" } },
});

function makeRequest({
  url = "http://localhost/api/things/abc",
  body = '{"name":"n"}',
  session = "valid",
}: { url?: string; body?: string; session?: string | null } = {}) {
  return new NextRequest(url, {
    method: "POST",
    body,
    headers: session ? { cookie: `session=${session}` } : {},
  });
}

const ctx = (id = "abc") => ({ params: Promise.resolve({ id }) });

describe("authedRoute", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  const handler = authedRoute(
    postThing,
    thingSchemas,
    ({ user, params, query, body }) => ({
      id: params.id,
      page: query.page,
      name: body.name,
      userId: user.id,
    }),
  );

  it("passes parsed inputs and the user to the handler, with the contract's status", async () => {
    const response = await handler(
      makeRequest({ url: "http://localhost/api/things/abc?page=2" }),
      ctx(),
    );
    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      id: "abc",
      page: 2,
      name: "n",
      userId: "user-1",
    });
  });

  it("rejects an anonymous caller before validating anything", async () => {
    const response = await handler(
      makeRequest({ session: null, body: "{bad" }),
      ctx("x"),
    );
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "Authentication required",
      code: "unauthenticated",
    });
  });

  it("returns a 400 with issues for each kind of bad input", async () => {
    const badParams = await handler(makeRequest(), ctx("x"));
    expect(badParams.status).toBe(400);
    await expect(badParams.json()).resolves.toEqual({
      error: "Bad id",
      code: "validation",
      issues: [{ path: "id", message: "Bad id" }],
    });

    const badQuery = await handler(
      makeRequest({ url: "http://localhost/api/things/abc?page=2x" }),
      ctx(),
    );
    expect(badQuery.status).toBe(400);
    expect((await badQuery.json()).error).toBe("Bad page");

    const badBody = await handler(makeRequest({ body: "{}" }), ctx());
    expect(badBody.status).toBe(400);
    expect((await badBody.json()).issues).toEqual([
      { path: "name", message: "Name is required" },
    ]);
  });

  it("returns a 400, not a 500, for malformed JSON", async () => {
    const response = await handler(makeRequest({ body: "{bad" }), ctx());
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "Request body must be valid JSON",
      code: "validation",
    });
  });

  it("maps a returned string to the contract's error", async () => {
    const failing = authedRoute(
      postThing,
      thingSchemas,
      () => "conflict" as const,
    );
    const response = await failing(makeRequest(), ctx());
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "Already exists",
      code: "conflict",
    });
  });

  it("passes a NextResponse through untouched", async () => {
    const raw = authedRoute(postThing, thingSchemas, () => {
      const response = NextResponse.json({ id: "a", name: "n" });
      response.cookies.set("session", "new");
      return response;
    });
    const response = await raw(makeRequest(), ctx());
    expect(response.status).toBe(200);
    expect(response.cookies.get("session")?.value).toBe("new");
  });

  it("sends a thrown error to handleApiError using the label", async () => {
    const throwing = authedRoute(postThing, thingSchemas, () => {
      throw new Error("boom");
    });
    const response = await throwing(makeRequest(), ctx());
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Post thing failed",
      code: "internal",
    });
  });

  it("applies options.headers to success, 401, and validation responses", async () => {
    const withHeader = authedRoute(
      postThing,
      thingSchemas,
      () => ({ id: "a", name: "n" }),
      { headers: { "Cache-Control": "private, no-store" } },
    );
    const responses = await Promise.all([
      withHeader(makeRequest(), ctx()),
      withHeader(makeRequest({ session: null }), ctx()),
      withHeader(makeRequest(), ctx("x")),
    ]);
    expect(responses.map((r) => r.status)).toEqual([201, 401, 400]);
    for (const response of responses) {
      expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    }
  });
});

describe("publicRoute", () => {
  it("runs without a session and has no user", async () => {
    const handler = publicRoute(postThing, thingSchemas, (inputs) => ({
      id: inputs.params.id,
      name: inputs.body.name,
      userId: "user" in inputs ? "leaked" : undefined,
    }));
    const response = await handler(makeRequest({ session: null }), ctx());
    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({ id: "abc", name: "n" });
  });

  it("works on a static route called with only a request", async () => {
    const getThings = defineContract({
      method: "GET",
      path: "/api/things",
      label: "Get things",
      response: type<{ ok: boolean }>(),
    });
    const handler = publicRoute(getThings, {}, () => ({ ok: true }));
    const response = await handler(
      new NextRequest("http://localhost/api/things"),
    );
    await expect(response.json()).resolves.toEqual({ ok: true });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm exec vitest run src/lib/api/route.test.ts`
Expected: FAIL, cannot resolve `./route`.

- [ ] **Step 3: Write the wrapper**

Create `src/lib/api/route.ts`:

```ts
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
```

- [ ] **Step 4: Run the test and typecheck**

Run: `pnpm exec vitest run src/lib/api/route.test.ts && pnpm typecheck`
Expected: all PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/api/route.ts src/lib/api/route.test.ts
git commit -m "feat: add authedRoute and publicRoute wrappers"
```

---

### Task 4: Typed client and retry default

**Files:**
- Create: `src/lib/api/client.ts`
- Modify: `src/components/providers/ReactQueryProvider.tsx`
- Test: `src/lib/api/client.test.ts`, `src/lib/api/contract.types.test.ts`

**Interfaces:**
- Consumes: contract types and errors (Task 1). `authedRoute` types (Task 3).
- Produces: `api(contract, input?, init?)` returning `Promise<Jsonify<Response>>`. `ApiError<Code>` with `code`, `status` (0 when there was no response), `message`, `issues`. `isApiError(error, contract)`, `errorMessage(error, fallback)`, `shouldRetry(failureCount, error)`, `ApiErrorCode<C>`, `ApiInput<C>`, `ApiInit`.

`contract.types.test.ts` is checked by `tsc`, not at runtime. Each `@ts-expect-error` fails the typecheck if the line below it ever stops being a type error, which guards against `any` silently erasing the contract's guarantees.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/api/client.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import {
  api,
  ApiError,
  errorMessage,
  isApiError,
  shouldRetry,
} from "./client";
import { defineContract, schemas, type } from "./contract";

const _thingSchemas = {
  params: z.object({ id: z.string() }),
  query: z.object({ tag: z.array(z.string()).optional(), page: z.number().optional() }),
  body: z.object({ name: z.string() }).optional(),
};

const postThing = defineContract({
  method: "POST",
  path: "/api/things/[id]",
  label: "Post thing",
  schemas: schemas<typeof _thingSchemas>(),
  response: type<{ ok: boolean }>(),
  errors: { conflict: { status: 409, message: "Already exists" } },
});

const getThings = defineContract({
  method: "GET",
  path: "/api/things",
  label: "Get things",
  response: type<{ ok: boolean }>(),
});

const fetchMock = vi.fn<typeof fetch>();

function respondWith(status: number, body: string) {
  fetchMock.mockResolvedValue(new Response(body, { status }));
}

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
});

describe("api", () => {
  it("fills the path, encodes params, and repeats array query keys", async () => {
    respondWith(200, '{"ok":true}');
    await api(postThing, {
      params: { id: "a/b" },
      query: { tag: ["x", "y"], page: undefined },
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/things/a%2Fb?tag=x&tag=y",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("sends a body as JSON, and no body or header when there is none", async () => {
    respondWith(200, '{"ok":true}');
    await api(postThing, { params: { id: "1" }, body: { name: "n" } });
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      headers: { "Content-Type": "application/json" },
      body: '{"name":"n"}',
    });

    fetchMock.mockClear();
    respondWith(200, '{"ok":true}');
    await api(getThings);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/things");
    expect(fetchMock.mock.calls[0]?.[1]).not.toHaveProperty("body");
  });

  it("returns the parsed response and reads the body", async () => {
    const response = new Response('{"ok":true}', { status: 200 });
    fetchMock.mockResolvedValue(response);
    await expect(api(getThings)).resolves.toEqual({ ok: true });
    expect(response.bodyUsed).toBe(true);
  });

  it("throws ApiError with the code, status, message, and issues", async () => {
    respondWith(
      400,
      '{"error":"Bad","code":"validation","issues":[{"path":"name","message":"Bad"}]}',
    );
    const error = await api(getThings).catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      code: "validation",
      status: 400,
      message: "Bad",
      issues: [{ path: "name", message: "Bad" }],
    });
  });

  it("uses invalidResponse for a body with an error but no code", async () => {
    respondWith(500, '{"error":"Old route"}');
    await expect(api(getThings)).rejects.toMatchObject({
      code: "invalidResponse",
      status: 500,
      message: "Old route",
    });
  });

  it("uses invalidResponse for a non-JSON error page, and reads it", async () => {
    const response = new Response("<html>Bad gateway</html>", { status: 502 });
    fetchMock.mockResolvedValue(response);
    await expect(api(getThings)).rejects.toMatchObject({
      code: "invalidResponse",
      status: 502,
      message: "Get things failed",
    });
    expect(response.bodyUsed).toBe(true);
  });

  it("uses invalidResponse for a 200 that is not JSON", async () => {
    respondWith(200, "<html></html>");
    await expect(api(getThings)).rejects.toMatchObject({
      code: "invalidResponse",
      status: 200,
    });
  });

  it("uses network when fetch rejects", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(api(getThings)).rejects.toMatchObject({
      code: "network",
      status: 0,
    });
  });

  it("rethrows a cancellation as is, for React Query", async () => {
    const controller = new AbortController();
    const abort = new DOMException("Aborted", "AbortError");
    fetchMock.mockImplementation(async () => {
      controller.abort();
      throw abort;
    });
    await expect(
      api(getThings, {}, { signal: controller.signal }),
    ).rejects.toBe(abort);
  });
});

describe("isApiError", () => {
  it("accepts this contract's codes and the shared ones", () => {
    for (const code of ["conflict", "validation", "network", "invalidResponse"]) {
      expect(isApiError(new ApiError(code, 400, "x"), postThing)).toBe(true);
    }
  });

  it("rejects another contract's code and other errors", () => {
    expect(isApiError(new ApiError("other", 400, "x"), postThing)).toBe(false);
    expect(isApiError(new Error("x"), postThing)).toBe(false);
  });
});

describe("errorMessage", () => {
  it("uses an Error's message, otherwise the fallback", () => {
    expect(errorMessage(new ApiError("x", 400, "Server says"), "f")).toBe(
      "Server says",
    );
    expect(errorMessage("nope", "fallback")).toBe("fallback");
  });
});

describe("shouldRetry", () => {
  it("retries once for network, 5xx, and unknown errors", () => {
    for (const error of [
      new ApiError("network", 0, "x"),
      new ApiError("internal", 500, "x"),
      new Error("x"),
    ]) {
      expect(shouldRetry(0, error)).toBe(true);
      expect(shouldRetry(1, error)).toBe(false);
    }
  });

  it("never retries a 4xx", () => {
    expect(shouldRetry(0, new ApiError("validation", 400, "x"))).toBe(false);
    expect(shouldRetry(0, new ApiError("rateLimited", 429, "x"))).toBe(false);
  });
});
```

Create `src/lib/api/contract.types.test.ts`:

```ts
import { expect, it } from "vitest";
import { z } from "zod";

import { api, ApiError, type ApiErrorCode, isApiError } from "./client";
import { defineContract, type Jsonify, schemas, type } from "./contract";
import { q } from "./query";

// `route.ts` loads the database, so its types are used without importing it.
declare const authedRoute: typeof import("./route").authedRoute;

const thingSchemas = {
  params: z.object({ id: z.uuid(), subId: z.string() }),
  query: z.object({ page: q.int().optional() }),
  body: z.object({ name: z.string() }),
};
const postThing = defineContract({
  method: "POST",
  path: "/api/things/[id]/sub/[subId]",
  label: "Post thing",
  schemas: schemas<typeof thingSchemas>(),
  response: type<{ when: Date; count: number }>(),
  errors: { nope: { status: 404, message: "No" } },
});
const listThings = defineContract({
  method: "GET",
  path: "/api/things",
  label: "List things",
  response: type<{ count: number }[]>(),
});
const _missingSub = { params: z.object({ id: z.string() }) };
const _staticParams = { params: z.object({ id: z.string() }) };

// Never called: this function exists for `tsc`. Each `@ts-expect-error` fails
// the typecheck if the line below it stops being a type error.
export async function typeChecks() {
  defineContract({
    method: "GET",
    path: "/api/a/[id]/[subId]",
    label: "x",
    // @ts-expect-error params must cover every path segment
    schemas: schemas<typeof _missingSub>(),
    response: type<{ a: 1 }>(),
  });
  // @ts-expect-error a path with segments needs a params schema
  defineContract({
    method: "GET",
    path: "/api/a/[id]",
    label: "x",
    response: type<{ a: 1 }>(),
  });
  defineContract({
    method: "GET",
    path: "/api/a",
    label: "x",
    // @ts-expect-error a static path cannot have params
    schemas: schemas<typeof _staticParams>(),
    response: type<{ a: 1 }>(),
  });
  // @ts-expect-error a response must be an object or array
  type<string>();

  authedRoute(postThing, thingSchemas, ({ params, query, body, user }) => {
    const subId: string = params.subId;
    const page: number | undefined = query.page;
    const name: string = body.name;
    const userId: string = user.id;
    void [subId, page, name, userId];
    return { when: new Date(), count: 1 };
  });
  authedRoute(postThing, thingSchemas, () => "nope" as const);
  authedRoute(postThing, thingSchemas, async () =>
    Math.random() > 2 ? ("nope" as const) : { when: new Date(), count: 1 },
  );
  // @ts-expect-error the schemas must be the ones the contract names
  authedRoute(postThing, {}, () => ({ when: new Date(), count: 1 }));
  // @ts-expect-error an undeclared error code does not compile
  authedRoute(postThing, thingSchemas, () => "conflict" as const);
  // @ts-expect-error the response must match the contract
  authedRoute(postThing, thingSchemas, () => ({ count: "1" }));

  const thing = await api(postThing, {
    params: { id: "1", subId: "2" },
    body: { name: "n" },
  });
  const when: string = thing.when;
  // @ts-expect-error a Date is a string on the wire
  const notADate: Date = thing.when;
  void [when, notADate];
  // @ts-expect-error input is required when the contract needs it
  await api(postThing);
  // @ts-expect-error body is required
  await api(postThing, { params: { id: "1", subId: "2" } });
  await api(postThing, {
    params: { id: "1", subId: "2" },
    query: { page: 3 },
    body: { name: "n" },
  });
  const things = await api(listThings);
  const count: number = things[0]!.count;
  void count;

  const error: unknown = new ApiError("nope", 404, "No");
  if (isApiError(error, postThing)) {
    const code: ApiErrorCode<typeof postThing> = error.code;
    void code;
    // @ts-expect-error not one of this contract's codes
    void (error.code === "somethingElse");
  }

  const jsonified: Jsonify<{ a: Date[]; b: { c: Date | null } }> = {
    a: ["2026-01-01"],
    b: { c: null },
  };
  void jsonified;
}

it("is checked by tsc", () => {
  expect(typeChecks).toBeTypeOf("function");
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm exec vitest run src/lib/api/client.test.ts`
Expected: FAIL, cannot resolve `./client`.

- [ ] **Step 3: Write the client**

Create `src/lib/api/client.ts`:

```ts
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

  const parsed: unknown = await response.json().catch(() => undefined);

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
```

- [ ] **Step 4: Use the retry default**

Apply to `src/components/providers/ReactQueryProvider.tsx`:

```diff
diff --git a/src/components/providers/ReactQueryProvider.tsx b/src/components/providers/ReactQueryProvider.tsx
index 7f6e773..846f996 100644
--- a/src/components/providers/ReactQueryProvider.tsx
+++ b/src/components/providers/ReactQueryProvider.tsx
@@ -3,6 +3,8 @@
 import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
 import React, { useState } from "react";
 
+import { shouldRetry } from "@/lib/api/client";
+
 export function ReactQueryProvider({
   children,
 }: {
@@ -15,7 +17,7 @@ export function ReactQueryProvider({
           queries: {
             // Avoid aggressive refetching; tune as needed
             refetchOnWindowFocus: false,
-            retry: 1,
+            retry: shouldRetry,
           },
         },
       }),
```

`retry: 1` retried every failure once. `shouldRetry` does the same except for a 4xx `ApiError`, which a retry cannot fix.

- [ ] **Step 5: Run the tests and typecheck**

Run: `pnpm exec vitest run src/lib/api && pnpm typecheck`
Expected: all PASS, no type errors. An "unused `@ts-expect-error`" error means a guarantee was lost, so fix the types, not the test.

- [ ] **Step 6: Commit**

```bash
git add src/lib/api src/components/providers/ReactQueryProvider.tsx
git commit -m "feat: add typed API client and skip retrying 4xx responses"
```

---

### Task 5: Migrate schedules

**Files:**
- Create: `src/lib/schedules/schemas.ts`, `src/lib/schedules/contract.ts`
- Modify: `src/app/api/schedules/route.ts`, `src/components/content/ScheduleManager.tsx`, `src/components/content/ScheduleManager.test.tsx`
- Test: `src/app/api/schedules/route.test.ts`, `src/lib/api/contracts.test.ts`

**Interfaces:**
- Consumes: `defineContract`, `schemas`, `type`, `q` (Task 1). `authedRoute` (Task 3). `api`, `errorMessage` (Task 4).
- Produces: contracts `getSchedules`, `addSchedule`, `removeSchedules`; schemas `getSchedulesSchemas`, `addScheduleSchemas`, `removeSchedulesSchemas`. Later plans copy this shape for every feature.

Behaviour changes, all intended: `dayOfWeek: 2.5`, `tmdbId: 1.5`, negative IDs, and `tmdbId=12abc` now return 400, and malformed JSON returns 400 instead of 500. Some 400 messages are reworded; `ScheduleManager` only displays them and does not match on them.

- [ ] **Step 1: Write the failing tests**

Create `src/app/api/schedules/route.test.ts`:

```ts
// @vitest-environment node
import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

const createSchedule = vi.fn();
const deleteSchedules = vi.fn();
const listSchedules = vi.fn();

vi.mock("@/lib/auth/webauthn", () => ({
  getCurrentUser: vi.fn(async (token?: string) =>
    token === "valid" ? { id: "user-1" } : null,
  ),
}));

vi.mock("@/lib/schedules/service", () => ({
  createSchedule: (...args: unknown[]) => createSchedule(...args),
  deleteSchedules: (...args: unknown[]) => deleteSchedules(...args),
  listSchedules: (...args: unknown[]) => listSchedules(...args),
}));

const { DELETE, GET, POST } = await import("./route");

const URL_BASE = "http://localhost/api/schedules";
const headers = { cookie: "session=valid" };

function post(body: string) {
  return POST(new NextRequest(URL_BASE, { method: "POST", headers, body }));
}

describe("GET /api/schedules", () => {
  it("passes parsed filters to the service", async () => {
    listSchedules.mockResolvedValue({ schedules: {}, totalShows: 0 });
    const response = await GET(
      new NextRequest(`${URL_BASE}?tmdbId=12&dayOfWeek=3`, { headers }),
    );
    expect(response.status).toBe(200);
    expect(listSchedules).toHaveBeenCalledWith("user-1", 12, 3);
  });

  it("treats empty filters as absent", async () => {
    listSchedules.mockResolvedValue({ schedules: {}, totalShows: 0 });
    await GET(new NextRequest(`${URL_BASE}?tmdbId=&dayOfWeek=`, { headers }));
    expect(listSchedules).toHaveBeenCalledWith("user-1", undefined, undefined);
  });

  it.each(["tmdbId=12abc", "tmdbId=0", "dayOfWeek=7", "dayOfWeek=2.5"])(
    "rejects %s",
    async (search) => {
      const response = await GET(
        new NextRequest(`${URL_BASE}?${search}`, { headers }),
      );
      expect(response.status).toBe(400);
      expect(listSchedules).not.toHaveBeenCalled();
    },
  );

  it("returns 401 without a session", async () => {
    const response = await GET(new NextRequest(URL_BASE));
    expect(response.status).toBe(401);
  });
});

describe("POST /api/schedules", () => {
  it("creates a schedule and returns 201", async () => {
    const item = { id: "s1", tmdbId: 1, createdAt: "t", title: "T" };
    createSchedule.mockResolvedValue(item);
    const response = await post('{"tmdbId":1,"dayOfWeek":2}');
    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual(item);
    expect(createSchedule).toHaveBeenCalledWith("user-1", {
      tmdbId: 1,
      dayOfWeek: 2,
    });
  });

  it.each([
    ['{"tmdbId":1,"dayOfWeek":2.5}', "fractional day"],
    ['{"tmdbId":1,"dayOfWeek":7}', "day out of range"],
    ['{"tmdbId":1.5,"dayOfWeek":2}', "fractional id"],
    ['{"tmdbId":"1","dayOfWeek":2}', "string id"],
    ['{"dayOfWeek":2}', "missing id"],
    ["{bad", "malformed JSON"],
  ])("rejects %s (%s) with a 400", async (body) => {
    const response = await post(body);
    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe("validation");
    expect(createSchedule).not.toHaveBeenCalled();
  });

  it.each([
    ["notFound", 404],
    ["invalidStatus", 400],
    ["duplicate", 409],
  ])("maps the service's %s to %i", async (code, status) => {
    createSchedule.mockResolvedValue(code);
    const response = await post('{"tmdbId":1,"dayOfWeek":2}');
    expect(response.status).toBe(status);
    expect((await response.json()).code).toBe(code);
  });
});

describe("DELETE /api/schedules", () => {
  const del = (search: string) =>
    DELETE(new NextRequest(`${URL_BASE}?${search}`, { method: "DELETE", headers }));

  it("removes schedules", async () => {
    deleteSchedules.mockResolvedValue({ message: "m", deletedSchedules: [] });
    const response = await del("tmdbId=1&dayOfWeek=2");
    expect(response.status).toBe(200);
    expect(deleteSchedules).toHaveBeenCalledWith("user-1", 1, 2);
  });

  it("requires tmdbId", async () => {
    const response = await del("dayOfWeek=2");
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe(
      "tmdbId must be a positive integer",
    );
  });

  it("returns 404 when nothing was scheduled", async () => {
    deleteSchedules.mockResolvedValue("notFound");
    const response = await del("tmdbId=1");
    expect(response.status).toBe(404);
    expect((await response.json()).code).toBe("notFound");
  });
});
```

Create `src/lib/api/contracts.test.ts`, which stops contract paths drifting from route files:

```ts
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import type { AnyContract } from "./contract";

const LIB = path.join(process.cwd(), "src/lib");

const files = readdirSync(LIB)
  .map((feature) => path.join(LIB, feature, "contract.ts"))
  .filter((file) => existsSync(file));

const modules: [string, Record<string, unknown>][] = await Promise.all(
  files.map(
    async (file) =>
      [file, await import(/* @vite-ignore */ file)] as [
        string,
        Record<string, unknown>,
      ],
  ),
);

function isContract(value: unknown): value is AnyContract {
  return (
    typeof value === "object" &&
    value !== null &&
    "method" in value &&
    "path" in value
  );
}

const contracts = modules.flatMap(([file, exports]) =>
  Object.entries(exports)
    .filter(([, value]) => isContract(value))
    .map(([name, value]) => [`${file}: ${name}`, value as AnyContract] as const),
);

function readRoute(contractPath: string): string | undefined {
  const base = path.join(process.cwd(), "src/app", contractPath);
  const file = ["route.ts", "route.tsx"]
    .map((name) => path.join(base, name))
    .find((candidate) => existsSync(candidate));
  return file && readFileSync(file, "utf8");
}

describe("contracts", () => {
  it("finds contracts to check", () => {
    expect(contracts.length).toBeGreaterThan(0);
  });

  // Read as text so this test does not load database code.
  it.each(contracts)("%s has a route exporting its method", (_, contract) => {
    const source = readRoute(contract.path);
    expect(source, `no route file for ${contract.path}`).toBeDefined();
    expect(source).toMatch(
      new RegExp(`export (const|(async )?function) ${contract.method}\\b`),
    );
  });
});
```

Apply to `src/components/content/ScheduleManager.test.tsx`. This gives the DELETE stub the real response shape and adds a test that the server's message reaches the user:

```diff
diff --git a/src/components/content/ScheduleManager.test.tsx b/src/components/content/ScheduleManager.test.tsx
index 32696fd..f34713f 100644
--- a/src/components/content/ScheduleManager.test.tsx
+++ b/src/components/content/ScheduleManager.test.tsx
@@ -81,7 +81,10 @@ describe("ScheduleManager", () => {
           const day = Number(params.get("dayOfWeek"));
           return {
             ok: true,
-            json: async () => ({ dayOfWeek: day }),
+            json: async () => ({
+              message: "Removed 1 schedule(s)",
+              deletedSchedules: [{ id: "s1", tmdbId, dayOfWeek: day }],
+            }),
           } as Response;
         }
         return { ok: true, json: async () => ({}) } as Response;
@@ -111,4 +114,36 @@ describe("ScheduleManager", () => {
       ).toBeGreaterThan(0),
     );
   });
+
+  it("shows the server's message when adding fails", async () => {
+    vi.spyOn(global, "fetch").mockImplementation((async (
+      _input: RequestInfo | URL,
+      init?: RequestInit,
+    ) => {
+      if (init?.method === "POST") {
+        return {
+          ok: false,
+          status: 409,
+          json: async () => ({
+            error: "Show is already scheduled for this day",
+            code: "duplicate",
+          }),
+        } as Response;
+      }
+      return {
+        ok: true,
+        json: async () => ({ schedules: {}, totalShows: 0 }),
+      } as Response;
+    }) as any);
+
+    renderWithQuery(<ScheduleManager tmdbId={tmdbId} watchStatus="watching" />);
+
+    const user = userEvent.setup();
+    const addButtons = await screen.findAllByRole("button", { name: /Add/i });
+    await user.click(addButtons[0]!);
+
+    expect(
+      await screen.findByText("Show is already scheduled for this day"),
+    ).toBeInTheDocument();
+  });
 });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm exec vitest run src/app/api/schedules src/lib/api/contracts.test.ts`
Expected: FAIL. `tmdbId=12abc`, `2.5`, and malformed JSON cases fail against the old route, bodies lack `code`, and "finds contracts to check" finds none.

- [ ] **Step 3: Write the schemas and contract**

Create `src/lib/schedules/schemas.ts`:

```ts
import { z } from "zod";

import { q } from "../api/query";

const TMDB_ID_MESSAGE = "tmdbId must be a positive integer";
const DAY_OF_WEEK_MESSAGE = "dayOfWeek must be a whole number between 0-6";

const tmdbIdParam = q.int({ min: 1, message: TMDB_ID_MESSAGE });
const dayOfWeekParam = q.int({ min: 0, max: 6, message: DAY_OF_WEEK_MESSAGE });

export const getSchedulesSchemas = {
  query: z.object({
    tmdbId: tmdbIdParam.optional(),
    dayOfWeek: dayOfWeekParam.optional(),
  }),
};

export const addScheduleSchemas = {
  body: z.object({
    tmdbId: z
      .number({ error: TMDB_ID_MESSAGE })
      .int({ error: TMDB_ID_MESSAGE })
      .positive({ error: TMDB_ID_MESSAGE }),
    dayOfWeek: z
      .number({ error: DAY_OF_WEEK_MESSAGE })
      .int({ error: DAY_OF_WEEK_MESSAGE })
      .min(0, { error: DAY_OF_WEEK_MESSAGE })
      .max(6, { error: DAY_OF_WEEK_MESSAGE }),
  }),
};

export const removeSchedulesSchemas = {
  query: z.object({
    tmdbId: tmdbIdParam,
    dayOfWeek: dayOfWeekParam.optional(),
  }),
};
```

Create `src/lib/schedules/contract.ts`:

```ts
import { defineContract, schemas, type } from "../api/contract";
import type {
  addScheduleSchemas,
  getSchedulesSchemas,
  removeSchedulesSchemas,
} from "./schemas";
import type {
  DeleteSchedulesResponse,
  GetSchedulesResponse,
  ScheduleItem,
} from "./types";

export const getSchedules = defineContract({
  method: "GET",
  path: "/api/schedules",
  label: "Get show schedules",
  schemas: schemas<typeof getSchedulesSchemas>(),
  response: type<GetSchedulesResponse>(),
});

export const addSchedule = defineContract({
  method: "POST",
  path: "/api/schedules",
  label: "Add show to schedule",
  status: 201,
  schemas: schemas<typeof addScheduleSchemas>(),
  response: type<ScheduleItem>(),
  errors: {
    notFound: {
      status: 404,
      message:
        "TV show not found in your library. Add it to your library first.",
    },
    invalidStatus: {
      status: 400,
      message:
        "Cannot schedule completed or dropped shows. Only shows that are planning, watching, or paused can be scheduled.",
    },
    duplicate: {
      status: 409,
      message: "Show is already scheduled for this day",
    },
  },
});

export const removeSchedules = defineContract({
  method: "DELETE",
  path: "/api/schedules",
  label: "Remove show from schedule",
  schemas: schemas<typeof removeSchedulesSchemas>(),
  response: type<DeleteSchedulesResponse>(),
  errors: {
    notFound: { status: 404, message: "Schedule not found" },
  },
});
```

- [ ] **Step 4: Rewrite the route**

Replace `src/app/api/schedules/route.ts` with:

```ts
import { authedRoute } from "@/lib/api/route";
import {
  addSchedule,
  getSchedules,
  removeSchedules,
} from "@/lib/schedules/contract";
import {
  addScheduleSchemas,
  getSchedulesSchemas,
  removeSchedulesSchemas,
} from "@/lib/schedules/schemas";
import {
  createSchedule,
  deleteSchedules,
  listSchedules,
} from "@/lib/schedules/service";

// GET /api/schedules - Get user's show schedules
export const GET = authedRoute(
  getSchedules,
  getSchedulesSchemas,
  ({ user, query }) => listSchedules(user.id, query.tmdbId, query.dayOfWeek),
);

// POST /api/schedules - Add show to schedule
export const POST = authedRoute(
  addSchedule,
  addScheduleSchemas,
  ({ user, body }) => createSchedule(user.id, body),
);

// DELETE /api/schedules - Remove show from schedule
export const DELETE = authedRoute(
  removeSchedules,
  removeSchedulesSchemas,
  ({ user, query }) => deleteSchedules(user.id, query.tmdbId, query.dayOfWeek),
);
```

- [ ] **Step 5: Update the component**

Apply to `src/components/content/ScheduleManager.tsx`:

```diff
diff --git a/src/components/content/ScheduleManager.tsx b/src/components/content/ScheduleManager.tsx
index cacb562..6fc3755 100644
--- a/src/components/content/ScheduleManager.tsx
+++ b/src/components/content/ScheduleManager.tsx
@@ -4,12 +4,14 @@ import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
 import { Clock,Plus, X } from "lucide-react";
 import { useMemo,useState } from "react";
 
+import { api, errorMessage } from "@/lib/api/client";
 import { WatchStatusEnum } from "@/lib/db/schema";
 import {
-  GetSchedulesResponse,
-  ScheduleItem,
-  SchedulesByDay,
-} from "@/lib/schedules/types";
+  addSchedule,
+  getSchedules,
+  removeSchedules,
+} from "@/lib/schedules/contract";
+import { GetSchedulesResponse, SchedulesByDay } from "@/lib/schedules/types";
 import { cn } from "@/lib/utils";
 
 import { Button } from "../ui/Button";
@@ -36,12 +38,7 @@ export function ScheduleManager({ tmdbId, watchStatus }: ScheduleManagerProps) {
 
   const schedulesQuery = useQuery<GetSchedulesResponse>({
     queryKey: ["schedules"],
-    queryFn: async () => {
-      const response = await fetch(`/api/schedules`);
-      if (!response.ok) throw new Error("Failed to fetch schedules");
-      const data = (await response.json()) as GetSchedulesResponse;
-      return data;
-    },
+    queryFn: ({ signal }) => api(getSchedules, {}, { signal }),
   });
 
   function computeOtherShowsByDay(
@@ -70,26 +67,12 @@ export function ScheduleManager({ tmdbId, watchStatus }: ScheduleManagerProps) {
   // React Query handles loading/fetching; derived values computed via useMemo
 
   const addToScheduleMutation = useMutation({
-    mutationFn: async (dayOfWeek: number) => {
-      const response = await fetch("/api/schedules", {
-        method: "POST",
-        headers: { "Content-Type": "application/json" },
-        body: JSON.stringify({ tmdbId, dayOfWeek }),
-      });
-      if (!response.ok) {
-        const errorData = await response.json();
-        throw new Error(errorData.error || "Failed to add to schedule");
-      }
-      const data = (await response.json()) as ScheduleItem;
-      return data;
-    },
+    mutationFn: (dayOfWeek: number) =>
+      api(addSchedule, { body: { tmdbId, dayOfWeek } }),
     onSuccess: (newItem, dayOfWeek) => {
       queryClient.setQueryData<GetSchedulesResponse>(["schedules"], (prev) => {
         const current = prev?.schedules || ({} as SchedulesByDay);
-        const updatedDay = [
-          ...(current[dayOfWeek] || []),
-          newItem as ScheduleItem,
-        ];
+        const updatedDay = [...(current[dayOfWeek] || []), newItem];
         return {
           schedules: { ...current, [dayOfWeek]: updatedDay },
           totalShows: (prev?.totalShows ?? 0) + 1,
@@ -97,43 +80,30 @@ export function ScheduleManager({ tmdbId, watchStatus }: ScheduleManagerProps) {
       });
     },
     onError: (err: unknown) => {
-      setError(
-        err instanceof Error ? err.message : "Failed to add to schedule",
-      );
+      setError(errorMessage(err, "Failed to add to schedule"));
     },
   });
 
   const removeFromScheduleMutation = useMutation({
-    mutationFn: async (dayOfWeek: number) => {
-      const response = await fetch(
-        `/api/schedules?tmdbId=${tmdbId}&dayOfWeek=${dayOfWeek}`,
-        { method: "DELETE" },
-      );
-      if (!response.ok) {
-        const errorData = await response.json();
-        throw new Error(errorData.error || "Failed to remove from schedule");
-      }
-      return response.json();
-    },
+    mutationFn: (dayOfWeek: number) =>
+      api(removeSchedules, { query: { tmdbId, dayOfWeek } }),
     onSuccess: (result, dayOfWeek) => {
       queryClient.setQueryData<GetSchedulesResponse>(["schedules"], (prev) => {
         const current = prev?.schedules || ({} as SchedulesByDay);
         const updatedDay = (current[dayOfWeek] || []).filter(
           (s) => s.tmdbId !== tmdbId,
         );
-        const deletedCount = Array.isArray(result?.deletedSchedules)
-          ? result.deletedSchedules.length
-          : 1;
         return {
           schedules: { ...current, [dayOfWeek]: updatedDay },
-          totalShows: Math.max((prev?.totalShows ?? 0) - deletedCount, 0),
+          totalShows: Math.max(
+            (prev?.totalShows ?? 0) - result.deletedSchedules.length,
+            0,
+          ),
         };
       });
     },
     onError: (err: unknown) => {
-      setError(
-        err instanceof Error ? err.message : "Failed to remove from schedule",
-      );
+      setError(errorMessage(err, "Failed to remove from schedule"));
     },
   });
 
```

- [ ] **Step 6: Run the tests and typecheck**

Run: `pnpm exec vitest run src/app/api/schedules src/lib/api src/components/content/ScheduleManager.test.tsx && pnpm typecheck`
Expected: all PASS, no type errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/schedules src/app/api/schedules src/lib/api/contracts.test.ts src/components/content/ScheduleManager.tsx src/components/content/ScheduleManager.test.tsx
git commit -m "refactor: move schedules onto typed API contracts"
```

---

### Task 6: Lint guards, API docs, and final checks

**Files:**
- Modify: `eslint.config.mjs`, `docs/api/openapi.yaml`

**Interfaces:**
- Consumes: everything above. Produces nothing later tasks use.

The lint rules are what keep the bundle saving: one runtime `zod` import in a contract would silently add about 55 KB.

- [ ] **Step 1: Add the lint rules**

Apply to `eslint.config.mjs`:

```diff
diff --git a/eslint.config.mjs b/eslint.config.mjs
index ac9f245..8455f04 100644
--- a/eslint.config.mjs
+++ b/eslint.config.mjs
@@ -86,6 +86,63 @@ const config = [
       ],
     },
   },
+  {
+    // Contracts and client code ship to the browser. A runtime import of Zod or
+    // a feature's schemas.ts adds about 55 KB gzipped to run validators the
+    // client never calls, and tree-shaking does not remove it (zod/mini included).
+    // `import type` is erased, so it stays allowed. @/lib/db/schema is allowed
+    // because components already import its enums.
+    files: [
+      "src/lib/**/contract.ts",
+      "src/lib/api/client.ts",
+      "src/lib/api/errors.ts",
+      "src/components/**/*.{ts,tsx}",
+      "src/hooks/**/*.{ts,tsx}",
+    ],
+    ignores: ["**/*.test.ts", "**/*.test.tsx"],
+    rules: {
+      "@typescript-eslint/no-restricted-imports": [
+        "error",
+        {
+          patterns: [
+            {
+              regex: "^zod(/|$)|(^|/)schemas$",
+              allowTypeImports: true,
+              message:
+                "Schemas are server-only. Use `import type` so Zod stays out of the client bundle.",
+            },
+          ],
+        },
+      ],
+    },
+  },
+  {
+    // A contract is imported by client code, so it must not reach server modules.
+    files: ["src/lib/**/contract.ts"],
+    ignores: ["**/*.test.ts"],
+    rules: {
+      "no-restricted-imports": [
+        "error",
+        {
+          paths: [
+            {
+              name: "next/navigation",
+              importNames: ["useRouter"],
+              message:
+                "Use useProgressRouter from @/hooks/useProgressRouter, so navigation shows the progress bar.",
+            },
+            { name: "next/server", message: "Contracts are client-safe." },
+          ],
+          patterns: [
+            {
+              regex: "(^|/)(db|service)$|^@/lib/auth/(webauthn|api-middleware)$",
+              message: "Contracts are client-safe; this module is server-only.",
+            },
+          ],
+        },
+      ],
+    },
+  },
   {
     // share-card.tsx is drawn by Satori (next/og), which knows plain <img>
     // and nothing of next/image. BrandLogo renders data-URI marks inside the
```

- [ ] **Step 2: Prove the rules catch violations**

Temporarily append to `src/lib/schedules/contract.ts`:

```ts
import { z } from "zod";
import { db } from "../db";
import { addScheduleSchemas } from "./schemas";
export const x = [z, db, addScheduleSchemas];
```

Run: `pnpm exec eslint src/lib/schedules/contract.ts`
Expected: `restricted` errors for `zod`, `../db`, and `./schemas`.

Then restore it: `git checkout -- src/lib/schedules/contract.ts`

- [ ] **Step 3: Document the error fields**

In `docs/api/openapi.yaml`, replace the `ErrorResponse` schema (line 39) with the block below. `code` is not required yet, because unmigrated routes do not send it; the last PR in the rollout makes it required.

```yaml
    ErrorResponse:
      type: object
      required: [error]
      properties:
        error:
          type: string
        code:
          type: string
          description: Machine-readable failure code. Branch on this, not on `error`.
        issues:
          type: array
          description: Present when `code` is `validation`.
          items:
            type: object
            required: [path, message]
            properties:
              path:
                type: string
              message:
                type: string
```

- [ ] **Step 4: Run every CI gate**

```bash
pnpm typecheck
pnpm lint:ci
pnpm test:coverage
rm -rf .next && DATABASE_URL=postgresql://ci:ci@localhost:5432/ci pnpm build
```

Expected: all pass, with coverage above the floors in `vitest.config.mts`. On the prototype, the suite had 1,492 passing tests. Run these one at a time and report any failure with its output.

- [ ] **Step 5: Check the bundle**

Run this in a POSIX shell, using `bash -c` if your shell is fish:

```bash
find .next/static/chunks -name '*.js' | xargs -I{} sh -c 'gzip -c "{}" | wc -c' | awk '{s+=$1} END {print "gz:", s, "delta:", s-507379}'
grep -lE 'invalid_union|ZodError|\$ZodType' .next/static/chunks/*.js | wc -l
```

Expected: delta about 706 and well under 10,000; `0` chunks containing Zod. If Zod appears, find the runtime import before going further.

- [ ] **Step 6: Commit**

```bash
git add eslint.config.mjs docs/api/openapi.yaml
git commit -m "chore: keep schemas out of client code and document error codes"
```

- [ ] **Step 7: Push the branch**

With the gates green and the tree clean, run `git push -u origin HEAD`. This is a backup only. Do not open a PR or merge unless asked.

---

## Later plans

Each remaining rollout PR gets its own plan, written after this one lands so it can copy the shape proven here. They were left out on purpose: each needs its routes read for deliberate leniency and for the column type behind each param.

1. Lists, including `content/[id]/lists`: the first dynamic routes on real `ctx.params`.
2. Status, including the `message.includes("404")` service checks.
3. TMDB and watch providers.
4. Profile and activity.
5. Series Finale.
6. Auth and admin.
7. `fetch` lint rule, expired-session handling, route consistency test, removing `validatePagination`, making `code` required in `openapi.yaml`, and docs.
