# API Conventions

This repository implements HTTP APIs as Next.js App Router route handlers under `src/app/api/**/route.ts`.

Every endpoint is described by a **contract**: its method, path, inputs, response type and failure codes. The server wraps its handler with the contract, and client code calls it through `api()` with the same contract, so both sides agree on types and error codes at compile time.

## Location & Naming

- Route handlers live under `src/app/api/<path>/route.ts`.
- Each file exports one or more HTTP methods (`GET`, `POST`, `PUT`, `PATCH`, `DELETE`).
- A feature keeps its API pieces in `src/lib/<feature>/`:
  - `contract.ts`: the contracts. Client-safe: client code imports it.
  - `schemas.ts`: the Zod schemas. Server-only.
  - `types.ts`: request and response types.
  - `service.ts`: business logic and data access.
- Contracts are named after the service function they call (`listLists`, `createList`; schedules predates the rule) and imported by namespace: `import * as schedulesApi from "@/lib/schedules/contract"`.

## Contracts and Schemas

```ts
// src/lib/schedules/schemas.ts - server only
export const addScheduleSchemas = {
  body: z.object({
    tmdbId: z.number().int().positive(),
    dayOfWeek: z.number().int().min(0).max(6),
  }),
};

// src/lib/schedules/contract.ts - client-safe; the schemas import is type-only
import type { addScheduleSchemas } from "./schemas";

export const addSchedule = defineContract({
  method: "POST",
  path: "/api/schedules",
  label: "Add show to schedule",
  status: 201,
  schemas: schemas<typeof addScheduleSchemas>(),
  response: type<ScheduleItem>(),
  errors: {
    notFound: { status: 404, message: "TV show not found in your library. ..." },
    duplicate: { status: 409, message: "Show is already scheduled for this day" },
  },
});
```

| Field | Required | Purpose |
| --- | --- | --- |
| `method`, `path` | Yes | `path` uses folder syntax, e.g. `/api/lists/[id]/items`. |
| `label` | Yes | Used for logging and the 500 message, `"<label> failed"`. |
| `schemas` | No | `schemas<typeof x>()`, pointing at the endpoint's `{ params, query, body }` schemas by type. `params` keys must equal the path's `[segments]`. |
| `response` | Yes | `type<T>()`. `T` must be an object or array type. |
| `status` | No | Success status, defaulting to 200. |
| `errors` | No | The route's own failure codes, each with a status and a message. |

Contracts reference schemas with `import type`, which is erased. A runtime import of Zod or a `schemas.ts` from client code adds about 55 KB gzipped to the bundle, so lint rules forbid it in contracts, components and hooks. A contract must not import server modules either (`db`, `service`, `next/server`).

### Validation

- Params that hold a `uuid` primary key use `z.uuid()`, so a malformed ID is a 400 instead of reaching Postgres. TMDB IDs are integers.
- Query strings are converted to an object first: `?x=` counts as absent, and a repeated key becomes an array. Use the helpers in [query.ts](../../src/lib/api/query.ts):
  - `q.int({ min, max })` accepts whole digit strings only (`12abc`, `2.5` and `""` fail). Use it for `page`, `limit` and numeric IDs in queries.
  - `q.list(schema)` accepts one value or many and outputs an array. `q.list(schema, { dropInvalid: true })` silently drops invalid elements.
  - An optional param with a default that also tolerates bad values: `z.enum([...]).default("x").catch("x")`.
- Reject input that is nonsense or would crash; keep leniency that is deliberate, such as unknown filter values in old URLs.
- Messages users see need custom wording in the schema. Zod's defaults are not written for end users.

## Handler Shapes

```ts
export const POST = authedRoute(
  schedulesApi.addSchedule,
  addScheduleSchemas,
  ({ user, body }) => createSchedule(user.id, body),
);
```

`authedRoute(contract, schemas, handler, options?)` and `publicRoute(contract, schemas, handler, options?)` from [route.ts](../../src/lib/api/route.ts) return the Next route handler. The schemas are passed at runtime because the contract holds only their type; a contract with no schemas passes `{}`. In order, the wrapper:

1. **Authenticates** (`authedRoute` only) through `withAuth`. This runs before validation, so anonymous callers learn nothing about the inputs.
2. **Validates** the route params, then the query, then the body. Unparseable JSON is a validation failure.
3. **Calls the handler** with `{ request, user, params, query, body }`, all parsed and typed. `user` is absent for `publicRoute`.
4. **Builds the response** from what the handler returned:
   - an object or array becomes JSON with the contract's status;
   - a string must be one of the contract's `errors` keys and becomes that error;
   - a `NextResponse` passes through untouched, for responses that set cookies.
5. **Catches anything thrown** and passes it to `handleApiError` with the contract's `label`.

`options.headers` sets headers on every response, including 401s and errors. The Series Finale routes use it for `Cache-Control: private, no-store`.

A test in [contracts.test.ts](../../src/lib/api/contracts.test.ts) requires every route to use one of the two wrappers, and every contract to have a route exporting its method.

Keep handlers thin: put business logic in `src/lib/<feature>/service.ts` and use the shared Drizzle instance from [db/index.ts](../../src/lib/db/index.ts). Services return a failure code string (`"notFound"`) and the route returns it as is.

### Routes that do not fit

| Route | Approach |
| --- | --- |
| `series-finale/[period]/card` | Returns a PNG, so it has no contract. Uses `withAuth` directly and validates its period with the shared schema. |
| `profile/import` | Reads a multipart upload and checks its size before reading it. Uses `withAuth` directly; its errors still carry a `code`. |
| `auth/*` routes that set cookies | Return `NextResponse.json(data satisfies T)` with the cookies set. |
| `auth/signout` | Has no body schema: it reads an optional body itself and tolerates a bad one. |
| `admin/device-claim` | `publicRoute` with no body schema. It checks the `x-admin-secret` header in constant time and logs failed attempts first, then parses the body with `adminDeviceClaimBody` and `invalidInput()`. A body schema would answer unauthorized callers with schema issues and skip the audit log. |

## Authentication

Most endpoints require the `session` cookie (httpOnly). `authedRoute` uses `withAuth` from [api-middleware.ts](../../src/lib/auth/api-middleware.ts), which answers:

- missing `session` cookie: `401 { "error": "Authentication required", "code": "unauthenticated" }`;
- invalid session: `401 { "error": "Invalid session", "code": "invalidSession" }`, and the cookie is cleared;
- failure while checking the session: `500 { "error": "Authentication failed", "code": "internal" }`.

Admin endpoints authenticate with a shared secret in the `x-admin-secret` header, compared to `process.env.ADMIN_API_SECRET`. See [admin/device-claim/route.ts](../../src/app/api/admin/device-claim/route.ts).

## Responses

### Success

Success responses are JSON objects or arrays, typed by the contract's `response`. Common patterns:

- wrapped resources: `{ list: ... }`, `{ lists: [...] }`, `{ user: ... }`;
- direct payloads for query endpoints, such as the activity timeline or TMDB search results.

The client receives `Jsonify<T>`: a `Date` in `T` arrives as a `string`.

### Errors

Every failure has this shape:

```json
{ "error": "Human-readable message", "code": "notFound", "issues": [{ "path": "id", "message": "..." }] }
```

`code` is always present; branch on it, never on `error`. `issues` is present only for `validation`. Never return raw upstream errors or stack traces.

Any route can return these codes, in addition to its contract's own:

| Code | Status | Source |
| --- | --- | --- |
| `validation` | 400 | The wrapper. `error` is the first issue's message; `issues` lists all of them. |
| `unauthenticated` | 401 | `withAuth`, no cookie. |
| `invalidSession` | 401 | `withAuth`, bad session. |
| `rateLimited` | 429 | `handleApiError` for a TMDB 429, and the proxy's rate limit. |
| `internal` | 500 | `handleApiError` for unknown failures (`"<label> failed"`), and `withAuth`. |
| `upstreamUnavailable` | 503 | `handleApiError` for other TMDB failures. |

## Calling the API from the client

```ts
const schedule = await api(schedulesApi.addSchedule, {
  body: { tmdbId, dayOfWeek },
});
```

`api(contract, input?, { signal }?)` from [client.ts](../../src/lib/api/client.ts) builds the URL (encoding `params`, writing arrays as repeated `query` keys), sends `body` as JSON, always reads the response body, and returns `Jsonify<T>`. It does not validate on the client; the server is the authority.

On any failure it throws `ApiError` with `code`, `status`, `message` and `issues`. Two codes exist only on the client: `network` (the request never got a response, `status` 0) and `invalidResponse` (the body was not an error body, such as a proxy's HTML page).

```ts
onError: (err) => {
  if (isApiError(err, schedulesApi.addSchedule) && err.code === "duplicate") { ... }
  setError(errorMessage(err, "Failed to add schedule"));
},
```

`isApiError(err, contract)` narrows `code` to that contract's codes plus the universal and client-only ones. `errorMessage(err, fallback)` gives the error's message or the fallback.

- Inside React Query, pass the query's `signal`: `queryFn: ({ signal }) => api(contract, input, { signal })`. The default retry policy retries once, but never a 4xx `ApiError`.
- A lint rule bans the `fetch` global in `src/components` and `src/hooks`. The share card's PNG download and the import upload disable it on their line, since `api()` handles neither.
- When a query or mutation fails with `unauthenticated` or `invalidSession` while a user is signed in, `AuthProvider` re-checks the session. If the server confirms it is gone, the user is signed out and the page refreshes, so an authenticated page redirects to `/auth`.

## Common Status Codes

- `200`: success
- `201`: created
- `400`: validation errors, malformed requests
- `401`: unauthenticated, invalid session, invalid admin secret
- `404`: resource not found (or not visible to this user)
- `409`: conflict (e.g. uniqueness constraints)
- `413`: upload too large
- `429`: rate-limited
- `500`: unexpected server error
- `503`: external service unavailable (e.g. TMDB)

## Pagination

### Page-based (`page`)

TMDB-backed endpoints accept a `page` query param, validated with `q.int({ min: 1, max: 1000 })`, and return `page`, `totalPages` and `totalResults` from upstream. Example: [tmdb/search](../../src/lib/tmdb/schemas.ts).

### Cursor-based (`cursor` + `limit`)

Timeline endpoints use `cursor` and `limit`, returning `nextCursor` / `hasMore`. Example: [activity/route.ts](../../src/app/api/activity/route.ts).

## OpenAPI

[openapi.yaml](./openapi.yaml) describes the API surface in OpenAPI 3.1. It is maintained by hand: when adding or changing an endpoint, update it too, including its error codes and security scheme (cookie `session` or `x-admin-secret`).
