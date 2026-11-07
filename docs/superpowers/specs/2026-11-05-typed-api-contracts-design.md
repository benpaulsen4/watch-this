# Typed API Contracts — Design

Date: 2026-11-05
Status: Approved; amended 2026-11-05 after prototyping (schema placement)

## Summary

Each API endpoint gets one definition, a contract, shared by its route handler
and its client callers. The contract drives input validation, typed path and
query parameters, typed responses, and typed error codes, so those four concerns
stop being re-implemented by hand in 43 route handlers and about 60 `fetch`
calls.

URLs, the one-file-per-route layout, and path-based rate limiting do not change.
The change is additive on the wire, and it ships one feature at a time.

## Problems this solves

Audited from the code on 2026-11-05.

| Area | Today | Consequence |
| --- | --- | --- |
| Validation | 130 hand-written `400` responses; 7 of 19 body parses are `as` casts | `username: 123` on `POST /api/lists/[id]/collaborators` throws on `.trim()` and returns 500. Malformed JSON returns 500 on any route that does not catch it itself. `dayOfWeek: 2.5` passes the `POST /api/schedules` checks. `GET /api/activity?limit=abc` sends `NaN` to the service. |
| Parameters | `withAuth` drops the route context; 13 route files split the URL path | Routes depend on hard-coded path positions such as `split("/")[3]`. |
| Client | About 60 raw `fetch` calls, cast with `as SomeResponse` | Nothing checks a cast against its route. `lists/types.ts` declares `createdAt: Date`, which is a string on the wire unless the service converts it. |
| Errors | `{ error: string }` only | The UI matches on text (`error.includes("username")`) or status (`response.status === 409`). |
| Upstream errors | `handleApiError` matches on message text | A TMDB 429 has the message `TMDB API error: 429 ...`, which hits the 503 branch first, so `docs/api/conventions.md`'s documented `429` for rate limits is not reached for TMDB. Services also detect a TMDB 404 with `message.includes("404")`, although `isTMDBHttpError` exists. |

Services already return failure codes such as `"notFound"` and `"forbidden"` in
42 places. Routes translate those to responses by hand. Those strings become the
typed error codes.

## Decisions

Record of what was chosen and why, so implementation does not relitigate them.

| Decision | Choice | Why |
| --- | --- | --- |
| Approach | Our own contracts on Zod, about 150–200 lines of infrastructure | Keeps URLs, file-based routes, the proxy's path-prefix rate limits, and tests that call route exports directly. |
| Rejected: tRPC | Not used | Moves calls behind one RPC endpoint, which breaks the proxy's prefix rules and the REST surface, and fits the binary and cookie-setting routes poorly. |
| Rejected: oRPC, ts-rest | Not used | A dependency at the centre of every route, with no need it meets that our own small layer does not. The main draw is generated OpenAPI, which nothing here consumes. |
| Schema placement | Zod schemas live in a server-only `schemas.ts`; contracts reference them with `import type` | Measured on 2026-11-05: Zod in contracts adds about 55 KB gzipped to the client, and `zod/mini` does not help because Turbopack bundles all its locales, even with named imports. The client never runs validators, so keeping them on the server costs 706 bytes in total. |
| Response validation | TypeScript only, no runtime check | Reuses `lib/*/types.ts`, avoids schemas for large TMDB payloads, and adds no per-request cost. |
| Error wire format | `error` stays, `code` is added | Installed PWAs may run older client code, which reads `error`. |
| Validation strictness | Reject what is nonsense or would crash; keep deliberate leniency | Closes the bugs above without breaking old filter URLs. See "Validation strictness". |
| React Query | Not converted in a separate pass | 21 of the 24 files that call `fetch` already use a React Query hook. See "Client". |
| Query keys | Hand-written, not generated from contracts | Hierarchical keys such as `["lists", listId, ...]` are what make broad invalidation work. |
| `withAuth` | Kept permanently | It is the layer under `authedRoute`, and the routes without contracts use it directly. |
| Rollout | One feature per PR, no flag | Old and new routes coexist, and the wire change is additive. |

## Non-goals

- Generating `docs/api/openapi.yaml`. It stays manually maintained.
- Changing URLs, HTTP methods, or success response shapes.
- Changing how server components call services.
- Moving `AuthProvider`, `ProfileClient` sign-out, or the passkey flows onto React
  Query hooks. They call `api()` directly instead.
- Restructuring service layers beyond the TMDB error checks listed under "Errors".
- Extending `Cache-Control: private, no-store` beyond the Series Finale routes
  that set it today.
- Validating inputs on the client before sending. Forms keep their existing
  checks. Schemas stay server-only, so sharing them with forms would need its own
  answer to the bundle cost.

## Architecture

```
src/lib/api/contract.ts         defineContract, type<T>(), schemas<S>(), Jsonify (client-safe)
src/lib/api/errors.ts           universal error codes, ApiErrorBody type (client-safe)
src/lib/api/query.ts            q helpers, searchParamsToObject (server only)
src/lib/api/route.ts            authedRoute, publicRoute (server only)
src/lib/api/client.ts           api(), ApiError, isApiError, errorMessage (client-safe)
src/lib/<feature>/contract.ts   that feature's endpoints (client-safe)
src/lib/<feature>/schemas.ts    that feature's Zod schemas (server only)
```

Contract files must not import `@/lib/db`, services, or anything else server-only.
`@/lib/db/schema` is allowed because 14 components already import its enums.

Contracts, the client, components, and hooks must not import Zod or a `schemas.ts`
at runtime; `import type` is allowed because it is erased. Lint rules enforce both.
The second uses `@typescript-eslint/no-restricted-imports`, which supports
`allowTypeImports`.

The ESLint config's existing `no-restricted-imports` entry for `src/**` would be
replaced, not merged, by a later block matching the same files. The contract-file
rule must repeat the `useRouter` restriction.

## Contract

```ts
// src/lib/lists/schemas.ts - server only
export const addCollaboratorSchemas = {
  params: z.object({ id: z.uuid() }),
  body: z.object({
    username: z.string().trim().min(1, "Username is required"),
    permissionLevel: z.enum(PermissionLevel).default(PermissionLevel.COLLABORATOR),
  }),
};

// src/lib/lists/contract.ts - client-safe; the schemas import is type-only
import type { addCollaboratorSchemas } from "./schemas";

export const addCollaborator = defineContract({
  method: "POST",
  path: "/api/lists/[id]/collaborators",
  label: "Add collaborator",
  schemas: schemas<typeof addCollaboratorSchemas>(),
  response: type<CollaboratorResponse>(),
  errors: {
    notFound: { status: 404, message: "List not found" },
    forbidden: { status: 403, message: "Only the list owner can add collaborators" },
    invalidUser: { status: 400, message: "Invalid target user" },
    conflict: { status: 409, message: "User is already a collaborator on this list" },
  },
});
```

| Field | Required | Purpose |
| --- | --- | --- |
| `method`, `path` | Yes | `path` uses folder syntax. |
| `label` | Yes | Used for logging and the 500 message, as `handleApiError(error, context)` does today. |
| `schemas` | No | `schemas<typeof x>()`, a compile-time marker for the endpoint's `{ params, query, body }` object. The type system requires `params` keys to equal the path's `[segments]`, with none missing and none extra. Values may be any schema that accepts a string, including `q.int`. Handlers receive the parsed output; clients provide the input. |
| `response` | Yes | `type<T>()`, a compile-time marker. `T` must be an object or array type. |
| `status` | No | Success status, defaulting to 200. Six places use 201. |
| `errors` | No | The route's failure codes, each with a status and a message. |

Params that hold a `uuid` primary key, such as list IDs, use `z.uuid()`. A malformed ID
then returns 400 instead of reaching Postgres. Not every `[id]` is one: TMDB IDs are
integers, and `profile/devices/[id]` holds a credential ID. Each migration PR checks the
column behind each param before choosing its schema.

### Query helpers

Query strings need rules of their own. The wrapper converts `URLSearchParams` to
an object before validating:

- `?x=` counts as absent, matching today's `if (param)` checks.
- A repeated key becomes an array.

Schemas use these helpers, from `src/lib/api/query.ts`:

- `q.int({ min, max })` accepts whole digit strings only. `z.coerce.number()` would
  turn an empty string into `0`. It replaces `validatePagination`.
- `q.list(schema)` accepts one value or many and always outputs an array, for
  parameters like `watchStatus`. `q.list(schema, { dropInvalid: true })` keeps the
  valid elements and silently drops the rest, using per-element `safeParse`;
  without the option, an invalid element fails validation. The array form is tried
  first, so an element schema with `.catch()` cannot swallow a whole array.

## Server wrapper

```ts
export const POST = authedRoute(
  addCollaborator,
  addCollaboratorSchemas,
  ({ user, params, body }) => createListCollaborator(user.id, params.id, body),
);
```

`authedRoute(contract, schemas, handler, options?)` and
`publicRoute(contract, schemas, handler, options?)` return a Next route handler. The
schemas are passed at runtime because the contract only holds their type, and the types
require them to be the ones the contract names. A contract with no schemas passes `{}`. In order, the wrapper:

1. **Authenticates** (`authedRoute` only), through `withAuth`, so 401s and cookie
   clearing do not change. This runs before validation, so anonymous callers learn
   nothing about the inputs.
2. **Validates** the awaited `ctx.params`, then `query`, then `body`. Unparseable
   JSON is a validation failure.
3. **Calls the handler** with `{ request, user, params, query, body }`. `user` is
   absent for `publicRoute`.
4. **Builds the response** from what the handler returned:
   - an object or array becomes JSON with the contract's status;
   - a string must be a key of the contract's `errors` and becomes that error;
   - a `NextResponse` passes through untouched.
5. **Catches anything thrown** and passes it to `handleApiError`, using `label`.

Responses are always objects or arrays, so a returned string is unambiguous. The
handler's return type is `T | keyof Errors | NextResponse`, so a service that gains
a new failure code stops the route compiling until the contract declares it.

`options.headers` applies headers to every response, including 401s and errors.

`withAuth` changes in one way: it forwards the route context to its handler.

### Routes that do not fit the standard shape

| Route | Approach |
| --- | --- |
| Session and challenge cookies (`auth/*`) | The handler returns `NextResponse.json(data satisfies T)` with cookies set. |
| Series Finale `Cache-Control` (4 JSON routes) | `options.headers`, keeping today's coverage of 401s and errors. |
| `series-finale/[period]/card` (PNG) | No contract. Uses `withAuth` directly, reading `ctx.params`. |
| `profile/import` (multipart) | No contract. Uses `withAuth` directly. Its size checks run before the file is read and must keep doing so. |
| `auth/signout` (lenient body) | No `body` schema. The handler reads `request` itself and tolerates a bad body, as it does now. |
| `admin/device-claim` | `publicRoute` with no `body` schema. The handler checks the secret in constant time and logs failed attempts first, then parses the body with the schema itself. The wrapper validates before calling the handler, so a `body` schema would give unauthorized callers a 400 listing schema issues and skip the audit log. There is only one such route, so it gets no auth mode of its own. |
| `auth/session` | Reads the cookie itself today. Moves to `authedRoute` if its 401 behaviour matches `withAuth`'s when migrated; otherwise `publicRoute`. Its existing tests decide. |

### Validation strictness

The rule: **reject input that is nonsense or would crash; keep leniency that is
deliberate.**

- Now a 400: `tmdbId=12abc` (`parseInt` reads it as 12), `dayOfWeek: 2.5`,
  `limit=abc`, and malformed IDs on `uuid` params.
- Still accepted: unknown `watchStatus` values and `sortOrder` on the list items
  route, which ignores them today. Old URLs can carry these through `ListFilters`.
  `watchStatus` uses `q.list(schema, { dropInvalid: true })`, so `watching&bogus`
  keeps `watching`. `sortOrder` uses `z.enum([...]).default("ascending").catch("ascending")`:
  `.default()` keeps the key optional in `api()` input and covers a missing value,
  and `.catch()` covers a bad one. A bare `.catch()` makes the key required in
  `z.input`, and `.optional().catch()` returns `undefined` for a missing value.

Each migration PR checks its routes for other deliberate leniency and keeps it.

## Errors

Every failure has this shape:

```ts
type ApiErrorBody = {
  error: string; // human-readable; unchanged field
  code: string; // new
  issues?: { path: string; message: string }[]; // validation failures only
};
```

Contract-declared codes are per-route. These are universal, and any route can
return them:

| Code | Status | Source |
| --- | --- | --- |
| `validation` | 400 | Wrapper. `error` is the first issue's message; `issues` lists all of them. |
| `unauthenticated` | 401 | `withAuth`, no cookie |
| `invalidSession` | 401 | `withAuth`, bad session |
| `rateLimited` | 429 | `handleApiError`, and the proxy's `Too many requests` response |
| `internal` | 500 | `handleApiError`, and `withAuth`'s `Authentication failed` |
| `upstreamUnavailable` | 503 | `handleApiError` |

Two more exist only on the client, for failures that never produce an `ApiErrorBody`:

| Code | When |
| --- | --- |
| `network` | `fetch` itself rejected. |
| `invalidResponse` | The body is not an `ApiErrorBody`, such as a proxy's HTML error page. `status` is kept. |

Validation messages shown to users need custom wording in the schema. Zod's defaults
are not written for end users.

### Changes to existing error handling

- `handleApiError` uses `isTMDBHttpError` and the error's `status` instead of matching
  message text. A TMDB 429 becomes `rateLimited`; other TMDB failures stay
  `upstreamUnavailable`. The unknown-error case stays `${label} failed`.
- The `message.includes("404")` checks in `lib/episodes/service.ts` and
  `lib/content-status/service.ts` use `isTMDBHttpError`.
- `withAuth` and the proxy add `code` to their error bodies.
- `PasskeyDevicesViewer.tsx:88` matches "rate limit" in message text. It moves to
  `code` in the profile PR.
- `AuthPageClient`'s `error.includes("username")` and `UsernameChanger`'s
  `response.status === 409` move to `code`, in the auth PR.

## Client

```ts
const collaborator = await api(addCollaborator, {
  params: { id },
  body: { username },
});
```

`api(contract, input, init?)`:

- builds the URL, encoding `params` and writing arrays as repeated `query` keys, and
  omitting `undefined`;
- sends `body` as JSON and accepts `init.signal` from React Query;
- returns `Jsonify<T>`, where `Date` becomes `string` recursively;
- throws `ApiError` on any failure;
- **always reads the response body**, even when unused or not JSON. An unread body
  leaves the request open and the page never goes network-idle, as the comment in
  `useSeriesFinale.ts` explains. That hook's `post` helper can then go.

Migrating a type to `Jsonify` is expected to reveal some real `Date`/`string`
mismatches. Fix them in that feature's PR.

`input` is required only when the contract has a required input. `api()` does not
validate on the client; the server is the authority.

### Handling errors

`ApiError` carries `code`, `status`, `message`, and `issues`. TypeScript has no typed
`throw`, and React Query types errors as `Error`, so narrowing goes through a guard:

```ts
onError: (err) => {
  if (isApiError(err, addCollaborator) && err.code === "conflict") { ... }
  setError(errorMessage(err, "Failed to add collaborator"));
},
```

`isApiError(err, contract)` narrows `code` to that contract's codes plus the universal
ones. `errorMessage(err, fallback)` replaces the repeated
`err instanceof Error ? err.message : "..."`.

### React Query

`api()` handles the request. React Query handles the lifecycle. Migration swaps what is
inside each existing `queryFn` and `mutationFn`:

```ts
useQuery({ queryKey: ["schedules"], queryFn: ({ signal }) => api(getSchedules, undefined, { signal }) });
```

- **Retry default:** `ReactQueryProvider`'s `retry` becomes "once, unless the error is
  an `ApiError` with a status below 500". `network` and 5xx still retry. A query's own
  `retry` still wins.
- **Query keys:** each feature exports key constants from its contract file, added only
  where a key is used in more than one file.
- **Redundant local state:** `ListSettingsModal`, `UsernameChanger`, `TimezoneSelector`,
  and `ProfilePictureManager` keep `useState` loading flags next to `useMutation`.
  Remove these during migration where `isPending` covers them.

### Expired sessions

`AuthProvider` subscribes to the query and mutation caches. On an `ApiError` with code
`unauthenticated` or `invalidSession`, while it holds a user, it runs its existing
session refresh, and the authenticated layout's existing redirect takes over. Requiring
a held user stops this firing for anonymous visitors, whose 401 from
`GET /api/auth/session` is normal.

### Remaining raw `fetch`

A lint rule bans the `fetch` global in `src/components` and `src/hooks`. Two call sites
are exempt: `ShareButton` (PNG blob) and the import upload in `DataExportImport`
(multipart). Export returns JSON and uses `api()`.

`src/lib/auth/client.ts` and `AuthProvider` use `api()` as ordinary calls without
React Query hooks.

The rule is enabled in the final PR, because `lint:ci` runs with `--max-warnings=0`
and would fail on unmigrated code.

## Testing

**New unit tests**

- `route.ts`: auth runs before validation; each failure type returns its status and
  code; malformed JSON returns 400; a returned string maps to its contract error; a
  `NextResponse` passes through; a thrown error reaches `handleApiError`;
  `options.headers` applies to 401s and errors.
- `contract.ts`: `q.int` rejects `12abc`, `2.5`, and empty strings; `q.list` handles
  one and many; `?x=` is absent; repeated keys become arrays.
- `client.ts`: URL building and encoding; JSON and non-JSON error bodies; network
  failure; the body is read when unused.
- `handleApiError`: a TMDB 429 returns `rateLimited`.
- Type-level tests with `// @ts-expect-error`: `params` keys match the path; `Jsonify`
  converts `Date`; an undeclared error string fails to compile.

**Consistency tests**

- Each contract's `path` has a route file exporting its `method`. The test reads files
  as text so it does not load database code. This stops client paths drifting from
  routes.
- From the final PR: every `route.ts` uses `authedRoute` or `publicRoute`, with an
  allowlist of the card and import routes.

**Existing tests**

- Route tests for dynamic routes need a `ctx` argument (about 5 files), through a small
  `routeContext(params)` test helper. Static route tests do not change.
- 8 assertions on route error text need checking as messages change.
- 26 test files stub `fetch`. `api()` only uses `ok`, `status`, and the body, so most
  stubs should keep working. A stub with no readable body needs one.

**Each migration PR** runs `pnpm typecheck`, `pnpm lint:ci`, `pnpm test`, and `pnpm build`.

## Docs

The final PR updates `docs/api/conventions.md` (handler shapes, validation, path
parameters, errors, new `code` field) and `docs/architecture/state-and-data-flow.md`.
Ten other docs mention `withAuth`; update any that describe the old pattern. Each
migration PR updates `openapi.yaml` for the routes it touches.

## Rollout

Old and new routes coexist throughout. Each PR is independently shippable.

| PR | Scope | Route files |
| --- | --- | --- |
| 1 | Foundation, `zod` dependency, `withAuth` context forwarding, `handleApiError` fix, retry default, plus schedules as the proving route | 1 |
| 2 | Lists, including `content/[id]/lists` | 8 |
| 3 | Status: content, episodes, next episode, and the `message.includes("404")` checks | 3 |
| 4 | TMDB and watch providers | 10 |
| 5 | Profile, activity | 7 |
| 6 | Series Finale, including card's `ctx.params` | 5 |
| 7 | Auth and admin, moved late because a mistake here locks users out | 9 |
| 8 | `fetch` lint rule, expired-session handling, route consistency test, remove `validatePagination`, docs | 0 |

**Foundation checks, prototyped on 2026-11-05 (Next 16.3.8)**

- **Next's route types.** Next generates checks on route export signatures. A temporary
  dynamic route using both wrappers passed `pnpm build`.
- **Client bundle.** Next 16's build no longer prints First Load JS, so this is measured
  as the gzipped total of `.next/static/chunks/*.js`. Baseline: 507,379 bytes. With
  schemas server-only: 508,085 bytes (+706), and no Zod in any client chunk. Each PR
  keeps the total growth under 10 kB gzipped.

PR 1 also adds the contract and schema lint rules, because contract files start there.
PR 8 adds the `fetch` rule.

## Risks

| Risk | Mitigation |
| --- | --- |
| A stricter schema rejects something a real client sends | Each PR migrates a route and its callers together, types flag mismatches, and the leniency rule applies. |
| A changed `400` message breaks text-matching UI | Text matches are listed above and move to `code`. Custom messages keep user-facing wording. |
| Auth route regression | Auth migrates late, after the wrapper has been proven on other routes, and has existing tests on `session` and `claim/verify`. Other auth routes get tests when they migrate. |
| Long migration leaves two patterns in place | Each PR removes the old pattern for its feature, and PR 8's lint and consistency checks prevent regressions. |
