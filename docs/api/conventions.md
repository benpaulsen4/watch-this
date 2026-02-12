# API Conventions

This repository implements HTTP APIs as Next.js App Router route handlers under `src/app/api/**/route.ts`.

All endpoints are JSON APIs and should respond using `NextResponse.json(...)` with stable, client-friendly payload shapes and status codes.

## Location & Naming

- Route handlers live under `src/app/api/<path>/route.ts`.
- Each file can export one or more HTTP methods (`GET`, `POST`, `PUT`, `PATCH`, `DELETE`) supported by that route.

## Handler Shapes

There are two common handler shapes in this codebase:

### Public routes

Public endpoints export standard route handler functions:

```ts
export async function GET(request: NextRequest) {
  return NextResponse.json({ ... });
}
```

Example: [auth/session/route.ts](../../src/app/api/auth/session/route.ts)

### Authenticated routes

Authenticated endpoints must wrap their handler with `withAuth`, which guarantees a user and injects it as `request.user`:

```ts
import { AuthenticatedRequest, withAuth } from "@/lib/auth/api-middleware";

export const GET = withAuth(async (request: AuthenticatedRequest) => {
  const userId = request.user.id;
  return NextResponse.json({ userId });
});
```

Example: [lists/route.ts](../../src/app/api/lists/route.ts)

## Business Logic & Data Access

Keep route handlers thin:

- Put business logic in `src/lib/<feature>/service.ts` (and related `types.ts`) and call those functions from the route handler.
- Use the shared Drizzle database instance from `src/lib/db` for queries/transactions.

Examples:

- List operations live in [lists/service.ts](../../src/lib/lists/service.ts) and are called by [lists/route.ts](../../src/app/api/lists/route.ts).
- Database wiring is defined in [db/index.ts](../../src/lib/db/index.ts).

## Authentication

Most endpoints require authentication via the `session` cookie (httpOnly).

- Auth middleware: [api-middleware.ts](../../src/lib/auth/api-middleware.ts)
- Wrapper: [withAuth](../../src/lib/auth/api-middleware.ts#L20-L58)
- Injected type: [AuthenticatedRequest](../../src/lib/auth/api-middleware.ts#L7-L13)

Behavior:

- Missing `session` cookie: `401 { "error": "Authentication required" }`
- Invalid session: `401 { "error": "Invalid session" }` and the `session` cookie is cleared
- Middleware failures: `500 { "error": "Authentication failed" }`

Exceptions:

- Some auth-adjacent endpoints (e.g. session inspection/update) manually read the cookie rather than using `withAuth`. See [auth/session/route.ts](../../src/app/api/auth/session/route.ts).

### Admin authentication (header-based)

Admin endpoints do not use `withAuth`. They authenticate using a shared secret in the `x-admin-secret` request header and compare it to `process.env.ADMIN_API_SECRET`.

Example: [admin/device-claim/route.ts](../../src/app/api/admin/device-claim/route.ts)

## Request Parsing & Validation

General guidelines:

- Parse query parameters using `new URL(request.url).searchParams`.
- Parse JSON bodies using `await request.json()` (for `POST`/`PUT`/`PATCH`).
- Validate inputs early and return a `400` with `{ error: string }` when invalid.
- Use `409` for uniqueness/constraint conflicts (e.g. username already taken).

Examples:

- Query parameter validation: [tmdb/search/route.ts](../../src/app/api/tmdb/search/route.ts)
- Body validation + conflict: [auth/session/route.ts](../../src/app/api/auth/session/route.ts)

### Path parameters

When working with dynamic routes (e.g. `src/app/api/lists/[id]/route.ts`), path parameters are currently extracted by parsing `request.url` and splitting the pathname.

This is the existing convention for authenticated routes because `withAuth` currently wraps handlers in a way that does not expose the App Router handler context (`{ params }`) to the inner handler.

Potential improvement: extend `withAuth` to support the full route handler signature (including context/params) so new code can use typed params instead of string-splitting.

## Response Conventions

### Success responses

Success responses are JSON. Common patterns:

- Wrapped resource(s): `{ list: ... }`, `{ lists: [...] }`, `{ user: ... }`
- Direct typed payloads for query endpoints: some endpoints return a typed object directly (e.g. activity timeline or TMDB search results)

Examples:

- Wrapped lists: [lists/route.ts](../../src/app/api/lists/route.ts)
- Direct payload (activity): [activity/route.ts](../../src/app/api/activity/route.ts)
- Direct payload (TMDB search): [tmdb/search/route.ts](../../src/app/api/tmdb/search/route.ts)

If an endpoint creates a resource, return `201` when appropriate.

### Error responses

Error responses must use the shape:

```json
{ "error": "Human-readable message" }
```

Avoid returning raw upstream errors or stack traces to clients.

## Common Status Codes

- `200`: success
- `201`: created
- `400`: validation errors, missing parameters, malformed requests
- `401`: unauthenticated, invalid session, invalid admin secret
- `404`: resource not found (or user does not have access, depending on endpoint semantics)
- `409`: conflict (e.g. uniqueness constraints)
- `429`: rate-limited (primarily external integrations)
- `500`: unexpected server error
- `503`: external service unavailable (e.g. TMDB)

## Pagination

This codebase uses two pagination styles:

### Page-based (`page`)

Integration-backed endpoints often accept a `page` query param and validate it with the shared helper:

- [validatePagination](../../src/lib/auth/api-middleware.ts#L94-L111)
- Example usage: [tmdb/search/route.ts](../../src/app/api/tmdb/search/route.ts#L50-L56)

Typical responses include `page`, `totalPages`, and `totalResults` when mirroring upstream pagination.

### Cursor-based (`cursor` + `limit`)

Some “timeline” endpoints use cursor pagination with `cursor` and `limit`, returning `nextCursor` / `hasMore` as part of the payload.

Example: [activity/route.ts](../../src/app/api/activity/route.ts)

## Error Helpers (External Integrations)

When an endpoint depends on an external integration (e.g. TMDB), use the shared error normalizer so clients get stable responses:

- [handleApiError](../../src/lib/auth/api-middleware.ts#L66-L86)

`handleApiError(error, context)` maps common upstream failures to:

- `503 { error: "External service unavailable" }` for TMDB failures
- `429 { error: "Rate limit exceeded. Please try again later." }` for rate limits
- `500 { error: "<context> failed" }` for unknown failures

Example usage: [tmdb/search/route.ts](../../src/app/api/tmdb/search/route.ts#L99-L101)

## OpenAPI

The repository includes an OpenAPI 3.1 schema describing the API surface:

- [openapi.yaml](./openapi.yaml)

The spec is maintained manually. When adding or changing endpoints, keep the OpenAPI schema in sync (including the appropriate security scheme: cookie-based `session` vs `x-admin-secret`).
