# Typed API Contracts: Status Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the content-status, episode-status and next-episode routes and their 4 client callers onto typed contracts, and make the services detect a TMDB 404 by status instead of message text. This is layer 3 of 8 in the spec's rollout, stacked on PR #58.

**Architecture:** `src/lib/content-status/` and `src/lib/episodes/` each gain a `contract.ts` and `schemas.ts`. The three route files become thin `authedRoute` calls on the existing services. `ContentCard`, `ContentDetailsModal`, `EpisodeTracker` and `UpcomingActivityCard` call `api()` inside their existing React Query hooks.

**Tech Stack:** Next.js 16 App Router, TypeScript, Zod 4, React Query 5, Vitest, pnpm.

**Spec:** `docs/superpowers/specs/2026-11-05-typed-api-contracts-design.md`

## Global Constraints

- URLs, HTTP methods, and success response shapes do not change.
- Every error body keeps `error` and adds `code`.
- Client-bundled code never imports `zod`, a feature's `schemas.ts`, `@/lib/api/query` or `@/lib/api/route` at runtime. `import type` is fine. Total growth of `.next/static/chunks/*.js` stays under 10 kB gzipped against the 507,379-byte baseline.
- Contract files never import `@/lib/db`, services, `next/server`, or auth server modules.
- Contracts are named after their service function. Routes and components use `import * as contentStatusApi from "@/lib/content-status/contract"` and `import * as episodesApi from "@/lib/episodes/contract"`.
- Route tests build context with `routeContext()` from `@/test/route-context` when they need one. These routes have no path params, so they don't.
- In Vitest commands, pass directory paths, not bracket-escaped globs.
- All code below compiled and passed on a prototype on 2026-11-06: 1,621 tests, plus a live run over HTTP against a real Postgres. If something fails, the tree has probably drifted, so investigate instead of weakening a test or a type.

## File Structure

| File | Responsibility |
| --- | --- |
| `src/lib/content-status/service.ts`, `src/lib/episodes/service.ts` | Detect a TMDB 404 by `isTMDBHttpError` and `status` |
| `src/test/tmdb-error.ts` (new) | `tmdbError(status)`: a TMDB-shaped error for tests |
| `src/lib/content-status/schemas.ts`, `contract.ts` (new) | Content-status endpoints |
| `src/lib/episodes/schemas.ts`, `contract.ts` (new) | Episode-status and next-episode endpoints |
| `src/lib/episodes/types.ts` | Adds `DeleteEpisodeStatusesResponse` |
| `src/app/api/status/**/route.ts` | Rewritten on `authedRoute` |
| `ContentCard.tsx`, `ContentDetailsModal.tsx`, `EpisodeTracker.tsx`, `UpcomingActivityCard.tsx` | Call `api()`. `UpcomingActivityCard` takes its loading state from the mutation |
| `docs/api/openapi.yaml` | Integer bounds on these routes' parameters and bodies |

## Behaviour changes, all intended

- **TMDB 404s:** a non-TMDB error whose message mentions "404" is no longer reported as "not found". In `createOrUpdateContentStatus`, the old check wrapped the database transaction too.
- **IDs:** `tmdbId` must be a positive integer everywhere. Before, POST and PUT bodies accepted any truthy value, and `parseInt` read `550abc` as 550.
- **Episode numbers:** fractional, negative and string season and episode numbers return 400 instead of reaching the database. Query filters now reject negatives but accept 0, because season 0 holds specials and some seasons number an episode 0.
- **Single-episode POST:** still requires `episodeNumber` of at least 1, and batch PUT still accepts 0, as before. `watched` must be a boolean when given.
- **Messages:** a missing field returns that field's message, for example `tmdbId must be a positive integer` instead of `tmdbId and contentType are required`. A movie sent a status that isn't a TV status gets the TV-status message.
- **`ContentDetailsModal`:** a failed status change now carries the server's message instead of a fixed string. Nothing displays it today.

## Known, not changed here

When marking an episode watched, the service writes the row before a later TMDB call. If that call fails, the client gets a 503 although the write happened. The old route behaved the same way. This plan doesn't change it.

---

### Task 1: Detect TMDB 404s by status

**Files:**
- Modify: `src/lib/content-status/service.ts`, `src/lib/episodes/service.ts`, `src/lib/content-status/service.test.ts`, `src/lib/episodes/service.test.ts`, `src/lib/auth/api-middleware.test.ts`
- Create: `src/test/tmdb-error.ts`

**Interfaces:**
- Consumes: `isTMDBHttpError` and `TMDBHttpError` from `@/lib/tmdb/client`, which already exist.
- Produces: `tmdbError(status: number): TMDBHttpError` in `@/test/tmdb-error`, for later layers' tests.

The service tests mock `@/lib/tmdb/client`. The mocks now pass the real `isTMDBHttpError` through `importOriginal`, so the check under test is the real one.

- [ ] **Step 1: Write the failing tests**

Create `src/test/tmdb-error.ts`:

```ts
import type { TMDBHttpError } from "@/lib/tmdb/client";

/** An error shaped like the TMDB client's non-2xx failures, for tests. */
export function tmdbError(status: number): TMDBHttpError {
  const error = new Error(`TMDB API error: ${status}`) as TMDBHttpError;
  error.status = status;
  return error;
}
```

Apply to `src/lib/content-status/service.test.ts`:

```diff
diff --git a/src/lib/content-status/service.test.ts b/src/lib/content-status/service.test.ts
index c28c9f9..3b5d10b 100644
--- a/src/lib/content-status/service.test.ts
+++ b/src/lib/content-status/service.test.ts
@@ -1,5 +1,7 @@
 import { beforeEach, describe, expect, it, vi } from "vitest";
 
+import { tmdbError } from "@/test/tmdb-error";
+
 vi.mock("@/lib/db", () => {
   const resultsQueue: any[] = [];
   const setResults = (arr: any[]) => {
@@ -99,8 +101,10 @@ vi.mock("@/lib/activity/activityUtils", () => {
   };
 });
 
-vi.mock("@/lib/tmdb/client", () => {
+vi.mock("@/lib/tmdb/client", async (importOriginal) => {
   return {
+    isTMDBHttpError: (await importOriginal<typeof import("@/lib/tmdb/client")>())
+      .isTMDBHttpError,
     tmdbClient: {
       getMovieDetails: vi.fn(async (id: number) => ({
         id,
@@ -197,7 +201,9 @@ describe("content-status service", () => {
   });
 
   it("createOrUpdate returns notFound for missing TMDB", async () => {
-    (tmdbClient.getMovieDetails as any).mockRejectedValueOnce(new Error("404"));
+    (tmdbClient.getMovieDetails as any).mockRejectedValueOnce(
+      tmdbError(404),
+    );
     const result = await createOrUpdateContentStatus(userId, {
       tmdbId: 11,
       contentType: "movie",
@@ -206,6 +212,32 @@ describe("content-status service", () => {
     expect(result).toBe("notFound");
   });
 
+  // A 404 is read from the TMDB error's status, not from message text, so an
+  // unrelated failure that happens to mention 404 is not reported as missing.
+  it("createOrUpdate rethrows a non-TMDB error that mentions 404", async () => {
+    const unrelated = new Error("relation lookup 404 failed");
+    (tmdbClient.getMovieDetails as any).mockRejectedValueOnce(unrelated);
+    await expect(
+      createOrUpdateContentStatus(userId, {
+        tmdbId: 11,
+        contentType: "movie",
+        status: "completed",
+      } as any),
+    ).rejects.toBe(unrelated);
+  });
+
+  it("createOrUpdate rethrows a TMDB failure that is not a 404", async () => {
+    const failure = tmdbError(500);
+    (tmdbClient.getMovieDetails as any).mockRejectedValueOnce(failure);
+    await expect(
+      createOrUpdateContentStatus(userId, {
+        tmdbId: 11,
+        contentType: "movie",
+        status: "completed",
+      } as any),
+    ).rejects.toBe(failure);
+  });
+
   it("getContentStatus returns mapped row", async () => {
     const row = [
       {
```

Apply to `src/lib/episodes/service.test.ts`:

```diff
diff --git a/src/lib/episodes/service.test.ts b/src/lib/episodes/service.test.ts
index f41941a..ff270c2 100644
--- a/src/lib/episodes/service.test.ts
+++ b/src/lib/episodes/service.test.ts
@@ -1,5 +1,7 @@
 import { beforeEach, describe, expect, it, vi } from "vitest";
 
+import { tmdbError } from "@/test/tmdb-error";
+
 vi.mock("../db", () => {
   const resultsQueue: any[] = [];
   const setResults = (arr: any[]) => {
@@ -91,8 +93,10 @@ vi.mock("./episodeUtils", async (importOriginal) => {
   };
 });
 
-vi.mock("../tmdb/client", () => {
+vi.mock("../tmdb/client", async (importOriginal) => {
   return {
+    isTMDBHttpError: (await importOriginal<typeof import("../tmdb/client")>())
+      .isTMDBHttpError,
     tmdbClient: {
       getTVShowDetails: vi.fn(async (id: number) => ({ id, name: "S" })),
       getTVSeasonDetails: vi.fn(async (_id: number, season: number) => ({
@@ -235,12 +239,24 @@ describe("episodes service", () => {
 
   it("markNextEpisodeWatched returns notFound when show missing", async () => {
     (tmdbClient.getTVShowDetails as any).mockRejectedValueOnce(
-      new Error("404"),
+      tmdbError(404),
     );
     const result = await markNextEpisodeWatched(userId, 50);
     expect(result).toBe("notFound");
   });
 
+  it("markNextEpisodeWatched rethrows a show lookup failure that is not a 404", async () => {
+    const failure = tmdbError(503);
+    (tmdbClient.getTVShowDetails as any).mockRejectedValueOnce(failure);
+    await expect(markNextEpisodeWatched(userId, 51)).rejects.toBe(failure);
+  });
+
+  it("markNextEpisodeWatched rethrows a non-TMDB error that mentions 404", async () => {
+    const unrelated = new Error("socket 404 closed");
+    (tmdbClient.getTVShowDetails as any).mockRejectedValueOnce(unrelated);
+    await expect(markNextEpisodeWatched(userId, 52)).rejects.toBe(unrelated);
+  });
+
   it("markNextEpisodeWatched returns notAired when episode is in future", async () => {
     (db as any).__setMockResults([[]]);
     (tmdbClient.getTVEpisodeDetails as any).mockResolvedValueOnce({
@@ -254,7 +270,7 @@ describe("episodes service", () => {
   it("markNextEpisodeWatched returns noNextEpisode when episode details missing", async () => {
     (db as any).__setMockResults([[]]);
     (tmdbClient.getTVEpisodeDetails as any).mockRejectedValueOnce(
-      new Error("404"),
+      tmdbError(404),
     );
     const result = await markNextEpisodeWatched(userId, 7);
     expect(result).toBe("noNextEpisode");
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm exec vitest run src/lib/content-status src/lib/episodes`
Expected: FAIL in exactly 2 tests, `createOrUpdate rethrows a non-TMDB error that mentions 404` and `markNextEpisodeWatched rethrows a non-TMDB error that mentions 404`. The old text check reads those as 404s.

- [ ] **Step 3: Check the status instead of the message**

Apply to `src/lib/content-status/service.ts`:

```diff
diff --git a/src/lib/content-status/service.ts b/src/lib/content-status/service.ts
index 2d65ede..5f5578a 100644
--- a/src/lib/content-status/service.ts
+++ b/src/lib/content-status/service.ts
@@ -17,6 +17,7 @@ import {
   WatchStatusEnum,
 } from "@/lib/db/schema";
 import {
+  isTMDBHttpError,
   tmdbClient,
   TMDBMovie,
   TMDBSearchItem,
@@ -177,7 +178,7 @@ export async function createOrUpdateContentStatus(
     } catch {}
     return { status: mapRow(result) };
   } catch (error) {
-    if (error instanceof Error && error.message.includes("404"))
+    if (isTMDBHttpError(error) && error.status === 404)
       return "notFound";
     throw error;
   }
```

Apply to `src/lib/episodes/service.ts`:

```diff
diff --git a/src/lib/episodes/service.ts b/src/lib/episodes/service.ts
index 7febe37..365a357 100644
--- a/src/lib/episodes/service.ts
+++ b/src/lib/episodes/service.ts
@@ -2,7 +2,7 @@ import { and, desc, eq } from "drizzle-orm";
 
 import { db } from "@/lib/db";
 import { episodeWatchStatus } from "@/lib/db/schema";
-import { tmdbClient } from "@/lib/tmdb/client";
+import { isTMDBHttpError, tmdbClient } from "@/lib/tmdb/client";
 
 import {
   batchUpdateEpisodes as batchUpdate,
@@ -118,7 +118,7 @@ export async function markNextEpisodeWatched(
   try {
     showDetails = await tmdbClient.getTVShowDetails(tmdbId);
   } catch (error) {
-    if (error instanceof Error && error.message.includes("404"))
+    if (isTMDBHttpError(error) && error.status === 404)
       return "notFound";
     throw error;
   }
@@ -180,7 +180,7 @@ export async function markNextEpisodeWatched(
       nextEpisodeNumber,
     );
   } catch (error) {
-    if (error instanceof Error && error.message.includes("404"))
+    if (isTMDBHttpError(error) && error.status === 404)
       return "noNextEpisode";
     throw error;
   }
```

- [ ] **Step 4: Reuse the helper in the middleware test**

Apply to `src/lib/auth/api-middleware.test.ts`:

```diff
diff --git a/src/lib/auth/api-middleware.test.ts b/src/lib/auth/api-middleware.test.ts
index 601cae5..64e9d96 100644
--- a/src/lib/auth/api-middleware.test.ts
+++ b/src/lib/auth/api-middleware.test.ts
@@ -2,8 +2,8 @@
 import { NextRequest, NextResponse } from "next/server";
 import { beforeEach, describe, expect, it, vi } from "vitest";
 
-import type { TMDBHttpError } from "@/lib/tmdb/client";
 import { routeContext } from "@/test/route-context";
+import { tmdbError } from "@/test/tmdb-error";
 
 vi.mock("@/lib/auth/webauthn", () => ({
   getCurrentUser: vi.fn(async (token?: string) => {
@@ -14,11 +14,6 @@ vi.mock("@/lib/auth/webauthn", () => ({
 
 const { handleApiError, withAuth } = await import("./api-middleware");
 
-function tmdbError(status: number): TMDBHttpError {
-  const error = new Error(`TMDB API error: ${status} Nope`) as TMDBHttpError;
-  error.status = status;
-  return error;
-}
 
 beforeEach(() => {
   vi.spyOn(console, "error").mockImplementation(() => undefined);
```

- [ ] **Step 5: Run the tests and typecheck**

Run: `pnpm exec vitest run src/lib/content-status src/lib/episodes src/lib/auth && pnpm typecheck`
Expected: all PASS, no type errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/content-status src/lib/episodes src/lib/auth/api-middleware.test.ts src/test/tmdb-error.ts
git commit -m "fix: detect TMDB 404s by status instead of message text"
```

---

### Task 2: Content status

**Files:**
- Create: `src/lib/content-status/schemas.ts`, `src/lib/content-status/contract.ts`
- Modify: `src/app/api/status/content/route.ts`, `src/components/content/ContentCard.tsx`, `src/components/content/ContentDetailsModal.tsx`
- Test: `src/app/api/status/content/route.test.ts`

**Interfaces:**
- Consumes: from layer 1, `defineContract`, `schemas`, `type`, `q`, `authedRoute`, `api`.
- Produces: contracts `getContentStatus`, `createOrUpdateContentStatus`, `updateContentStatus`, `deleteContentStatus`, and their `*Schemas`.

A movie may only be `planning` or `completed`. The schema keeps `status` as one enum and checks movies with `superRefine`, rather than using a discriminated union. A union would force `ContentDetailsModal`, which holds a general `WatchStatusEnum`, to cast.

`ContentCard.tsx` keeps its imports at the bottom of the file. The diff moves the two it needs into the top block.

- [ ] **Step 1: Write the failing test**

Create `src/app/api/status/content/route.test.ts`:

```ts
// @vitest-environment node
import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

const createOrUpdateContentStatus = vi.fn();
const deleteContentStatus = vi.fn();
const getContentStatus = vi.fn();
const updateContentStatus = vi.fn();

vi.mock("@/lib/auth/webauthn", () => ({
  getCurrentUser: vi.fn(async () => ({ id: "user-1" })),
}));

vi.mock("@/lib/content-status/service", () => ({
  createOrUpdateContentStatus: (...args: unknown[]) =>
    createOrUpdateContentStatus(...args),
  deleteContentStatus: (...args: unknown[]) => deleteContentStatus(...args),
  getContentStatus: (...args: unknown[]) => getContentStatus(...args),
  updateContentStatus: (...args: unknown[]) => updateContentStatus(...args),
}));

const { DELETE, GET, POST, PUT } = await import("./route");

const URL_BASE = "http://localhost/api/status/content";
const headers = { cookie: "session=valid" };

function send(method: "POST" | "PUT", body: string) {
  const handler = method === "POST" ? POST : PUT;
  return handler(new NextRequest(URL_BASE, { method, headers, body }));
}

describe("GET and DELETE /api/status/content", () => {
  it("passes the parsed query to the service", async () => {
    getContentStatus.mockResolvedValue({ status: null });
    const response = await GET(
      new NextRequest(`${URL_BASE}?tmdbId=550&contentType=movie`, { headers }),
    );
    expect(response.status).toBe(200);
    expect(getContentStatus).toHaveBeenCalledWith("user-1", 550, "movie");
  });

  it.each([
    ["contentType=movie", "tmdbId must be a positive integer"],
    ["tmdbId=550abc&contentType=movie", "tmdbId must be a positive integer"],
    ["tmdbId=550", "Invalid content type. Must be 'movie' or 'tv'"],
    ["tmdbId=550&contentType=book", "Invalid content type. Must be 'movie' or 'tv'"],
  ])("rejects %s", async (search, error) => {
    const response = await GET(
      new NextRequest(`${URL_BASE}?${search}`, { headers }),
    );
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe(error);
    expect(getContentStatus).not.toHaveBeenCalled();
  });

  it("maps a missing status on delete to a 404", async () => {
    deleteContentStatus.mockResolvedValue("notFound");
    const response = await DELETE(
      new NextRequest(`${URL_BASE}?tmdbId=550&contentType=tv`, {
        method: "DELETE",
        headers,
      }),
    );
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "Content status not found",
      code: "notFound",
    });
    expect(deleteContentStatus).toHaveBeenCalledWith("user-1", 550, "tv");
  });
});

describe("POST /api/status/content", () => {
  it("creates and returns 201", async () => {
    createOrUpdateContentStatus.mockResolvedValue({ status: { id: "s1" } });
    const response = await send(
      "POST",
      '{"tmdbId":550,"contentType":"movie","status":"completed"}',
    );
    expect(response.status).toBe(201);
    expect(createOrUpdateContentStatus).toHaveBeenCalledWith("user-1", {
      tmdbId: 550,
      contentType: "movie",
      status: "completed",
    });
  });

  it.each([
    [
      '{"tmdbId":550,"contentType":"movie","status":"watching"}',
      "Invalid movie status. Must be 'planning' or 'completed'",
    ],
    [
      '{"tmdbId":550,"contentType":"tv","status":"binged"}',
      "Invalid TV status. Must be 'planning', 'watching', 'paused', 'completed', or 'dropped'",
    ],
    [
      '{"tmdbId":"550","contentType":"tv","status":"watching"}',
      "tmdbId must be a positive integer",
    ],
    [
      '{"tmdbId":550,"contentType":"book","status":"watching"}',
      "Invalid content type. Must be 'movie' or 'tv'",
    ],
  ])("rejects %s", async (body, error) => {
    const response = await send("POST", body);
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe(error);
    expect(createOrUpdateContentStatus).not.toHaveBeenCalled();
  });

  it("maps notFound to a 404", async () => {
    createOrUpdateContentStatus.mockResolvedValue("notFound");
    const response = await send(
      "POST",
      '{"tmdbId":550,"contentType":"tv","status":"watching"}',
    );
    expect(response.status).toBe(404);
    expect((await response.json()).error).toBe("Content not found");
  });
});

describe("PUT /api/status/content", () => {
  it("allows the status to be omitted", async () => {
    updateContentStatus.mockResolvedValue({ status: { id: "s1" } });
    const response = await send("PUT", '{"tmdbId":550,"contentType":"tv"}');
    expect(response.status).toBe(200);
    expect(updateContentStatus).toHaveBeenCalledWith("user-1", {
      tmdbId: 550,
      contentType: "tv",
    });
  });

  it("still checks a movie status when one is given", async () => {
    const response = await send(
      "PUT",
      '{"tmdbId":550,"contentType":"movie","status":"paused"}',
    );
    expect(response.status).toBe(400);
    expect(updateContentStatus).not.toHaveBeenCalled();
  });

  it("maps notFound to a 404", async () => {
    updateContentStatus.mockResolvedValue("notFound");
    const response = await send("PUT", '{"tmdbId":550,"contentType":"tv"}');
    expect(response.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm exec vitest run src/app/api/status/content`
Expected: FAIL. The `550abc` case passes, a string `tmdbId` reaches the service, and bodies lack `code`.

- [ ] **Step 3: Write the schemas and contract**

Create `src/lib/content-status/schemas.ts`:

```ts
import { z } from "zod";

import { q } from "../api/query";
import { ContentType, MovieWatchStatus, WatchStatus } from "../db/schema";

const TMDB_ID_INVALID = "tmdbId must be a positive integer";
const CONTENT_TYPE_INVALID = "Invalid content type. Must be 'movie' or 'tv'";
const MOVIE_STATUS_INVALID =
  "Invalid movie status. Must be 'planning' or 'completed'";
// Every status is a TV status, so this is the message for one outside the set.
const STATUS_INVALID =
  "Invalid TV status. Must be 'planning', 'watching', 'paused', 'completed', or 'dropped'";

const contentType = z.enum(ContentType, CONTENT_TYPE_INVALID);
const status = z.enum(WatchStatus, STATUS_INVALID);

/** Movies only have two statuses; TV shows use all of them. */
function checkMovieStatus(
  body: { contentType: string; status?: string },
  context: z.core.$RefinementCtx,
) {
  const movieStatuses: readonly string[] = Object.values(MovieWatchStatus);
  if (
    body.contentType === ContentType.MOVIE &&
    body.status !== undefined &&
    !movieStatuses.includes(body.status)
  ) {
    context.addIssue({
      code: "custom",
      path: ["status"],
      message: MOVIE_STATUS_INVALID,
    });
  }
}

const contentQuery = z.object({
  tmdbId: q.int({ min: 1, message: TMDB_ID_INVALID }),
  contentType,
});

export const getContentStatusSchemas = { query: contentQuery };

export const createOrUpdateContentStatusSchemas = {
  body: z
    .object({
      tmdbId: z.int(TMDB_ID_INVALID).positive(TMDB_ID_INVALID),
      contentType,
      status,
    })
    .superRefine(checkMovieStatus),
};

export const updateContentStatusSchemas = {
  body: z
    .object({
      tmdbId: z.int(TMDB_ID_INVALID).positive(TMDB_ID_INVALID),
      contentType,
      status: status.optional(),
    })
    .superRefine(checkMovieStatus),
};

export const deleteContentStatusSchemas = { query: contentQuery };
```

Create `src/lib/content-status/contract.ts`:

```ts
import { defineContract, schemas, type } from "../api/contract";
import type {
  createOrUpdateContentStatusSchemas,
  deleteContentStatusSchemas,
  getContentStatusSchemas,
  updateContentStatusSchemas,
} from "./schemas";
import type {
  ContentStatusItem,
  DeleteContentStatusResult,
  GetContentStatusResponse,
} from "./types";

const STATUS_NOT_FOUND = { status: 404, message: "Content status not found" };

export const getContentStatus = defineContract({
  method: "GET",
  path: "/api/status/content",
  label: "Get content status",
  schemas: schemas<typeof getContentStatusSchemas>(),
  response: type<GetContentStatusResponse>(),
});

export const createOrUpdateContentStatus = defineContract({
  method: "POST",
  path: "/api/status/content",
  label: "Create/update content status",
  status: 201,
  schemas: schemas<typeof createOrUpdateContentStatusSchemas>(),
  response: type<{ status: ContentStatusItem }>(),
  errors: { notFound: { status: 404, message: "Content not found" } },
});

export const updateContentStatus = defineContract({
  method: "PUT",
  path: "/api/status/content",
  label: "Update content status",
  schemas: schemas<typeof updateContentStatusSchemas>(),
  response: type<{ status: ContentStatusItem }>(),
  errors: { notFound: STATUS_NOT_FOUND },
});

export const deleteContentStatus = defineContract({
  method: "DELETE",
  path: "/api/status/content",
  label: "Delete content status",
  schemas: schemas<typeof deleteContentStatusSchemas>(),
  response: type<DeleteContentStatusResult>(),
  errors: { notFound: STATUS_NOT_FOUND },
});
```

- [ ] **Step 4: Rewrite the route**

Replace `src/app/api/status/content/route.ts` with:

```ts
import { authedRoute } from "@/lib/api/route";
import * as contentStatusApi from "@/lib/content-status/contract";
import {
  createOrUpdateContentStatusSchemas,
  deleteContentStatusSchemas,
  getContentStatusSchemas,
  updateContentStatusSchemas,
} from "@/lib/content-status/schemas";
import {
  createOrUpdateContentStatus,
  deleteContentStatus,
  getContentStatus,
  updateContentStatus,
} from "@/lib/content-status/service";

// GET /api/status/content - Get content watch status for authenticated user
export const GET = authedRoute(
  contentStatusApi.getContentStatus,
  getContentStatusSchemas,
  ({ user, query }) =>
    getContentStatus(user.id, query.tmdbId, query.contentType),
);

// POST /api/status/content - Create or update content watch status
export const POST = authedRoute(
  contentStatusApi.createOrUpdateContentStatus,
  createOrUpdateContentStatusSchemas,
  ({ user, body }) => createOrUpdateContentStatus(user.id, body),
);

// PUT /api/status/content - Update existing content watch status
export const PUT = authedRoute(
  contentStatusApi.updateContentStatus,
  updateContentStatusSchemas,
  ({ user, body }) => updateContentStatus(user.id, body),
);

// DELETE /api/status/content - Remove content watch status
export const DELETE = authedRoute(
  contentStatusApi.deleteContentStatus,
  deleteContentStatusSchemas,
  ({ user, query }) =>
    deleteContentStatus(user.id, query.tmdbId, query.contentType),
);
```

- [ ] **Step 5: Update the callers**

Apply to `src/components/content/ContentCard.tsx`:

```diff
diff --git a/src/components/content/ContentCard.tsx b/src/components/content/ContentCard.tsx
index 21b3582..9d5ee89 100644
--- a/src/components/content/ContentCard.tsx
+++ b/src/components/content/ContentCard.tsx
@@ -5,6 +5,8 @@ import { Play, Star } from "lucide-react";
 import Image from "next/image";
 import { forwardRef, useEffect, useRef, useState } from "react";
 
+import { api } from "@/lib/api/client";
+import * as contentStatusApi from "@/lib/content-status/contract";
 import type { WatchStatusEnum } from "@/lib/db/schema";
 import { getImageUrl } from "@/lib/tmdb/client";
 import { cn, formatVoteAverage } from "@/lib/utils";
@@ -57,21 +59,14 @@ const ContentCard = forwardRef<HTMLDivElement, ContentCardProps>(
     const clickCountRef = useRef(0);
 
     const completeMovieMutation = useMutation({
-      mutationFn: async (): Promise<CreateOrUpdateContentStatusResult> => {
-        const response = await fetch("/api/status/content", {
-          method: "POST",
-          headers: { "Content-Type": "application/json" },
-          body: JSON.stringify({
+      mutationFn: () =>
+        api(contentStatusApi.createOrUpdateContentStatus, {
+          body: {
             tmdbId: content.tmdbId,
             contentType: "movie",
             status: "completed",
-          }),
-        });
-        const data = await response.json();
-        if (!response.ok)
-          throw new Error(data.error || "Failed to update movie status");
-        return data;
-      },
+          },
+        }),
       onSuccess: () => {
         setWatchStatus("completed" as WatchStatusEnum);
         setQuickCompleteMessage("Movie marked as watched!");
@@ -305,8 +300,5 @@ const ContentCard = forwardRef<HTMLDivElement, ContentCardProps>(
 ContentCard.displayName = "ContentCard";
 
 export { ContentCard };
-import type {
-  CreateOrUpdateContentStatusResult,
-  TMDBContent,
-} from "@/lib/content-status/types";
+import type { TMDBContent } from "@/lib/content-status/types";
 import type { MarkNextEpisodeResult } from "@/lib/episodes/types";
```

Apply to `src/components/content/ContentDetailsModal.tsx`:

```diff
diff --git a/src/components/content/ContentDetailsModal.tsx b/src/components/content/ContentDetailsModal.tsx
index 13e5297..4e9a448 100644
--- a/src/components/content/ContentDetailsModal.tsx
+++ b/src/components/content/ContentDetailsModal.tsx
@@ -16,10 +16,9 @@ import {
   Tabs,
 } from "react-aria-components";
 
-import type {
-  CreateOrUpdateContentStatusResult,
-  TMDBContent,
-} from "@/lib/content-status/types";
+import { api } from "@/lib/api/client";
+import * as contentStatusApi from "@/lib/content-status/contract";
+import type { TMDBContent } from "@/lib/content-status/types";
 import type { WatchStatusEnum } from "@/lib/db/schema";
 import type {
   TMDBMovieDetails,
@@ -137,21 +136,14 @@ export function ContentDetailsModal({
   const contentStreaming = contentProvidersQuery.data?.providers || null;
 
   const updateStatusMutation = useMutation({
-    mutationFn: async (
-      newStatus: WatchStatusEnum,
-    ): Promise<CreateOrUpdateContentStatusResult> => {
-      const response = await fetch("/api/status/content", {
-        method: "POST",
-        headers: { "Content-Type": "application/json" },
-        body: JSON.stringify({
+    mutationFn: (newStatus: WatchStatusEnum) =>
+      api(contentStatusApi.createOrUpdateContentStatus, {
+        body: {
           tmdbId: content.tmdbId,
           contentType: content.contentType,
           status: newStatus,
-        }),
-      });
-      if (!response.ok) throw new Error("Failed to update watch status");
-      return response.json();
-    },
+        },
+      }),
     onSuccess: (_data, variables) => {
       setWatchStatus(variables);
       onShowStatusChanged?.(variables);
```

- [ ] **Step 6: Run the tests and typecheck**

Run: `pnpm exec vitest run src/app/api/status src/components/content src/lib/api && pnpm typecheck`
Expected: all PASS, no type errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/content-status src/app/api/status/content src/components/content/ContentCard.tsx src/components/content/ContentDetailsModal.tsx
git commit -m "refactor: move content status onto typed contracts"
```

---

### Task 3: Episode status and next episode

**Files:**
- Create: `src/lib/episodes/schemas.ts`, `src/lib/episodes/contract.ts`
- Modify: `src/lib/episodes/types.ts`, `src/app/api/status/episodes/route.ts`, `src/app/api/status/episodes/next/route.ts`, `src/components/content/ContentCard.tsx`, `src/components/content/EpisodeTracker.tsx`, `src/components/activity/UpcomingActivityCard.tsx`
- Test: `src/app/api/status/episodes/route.test.ts`

**Interfaces:**
- Consumes: from layer 1, the same as Task 2. From Task 2, `ContentCard.tsx` already imports `api`.
- Produces: contracts `listEpisodeStatuses`, `updateEpisodeStatus`, `batchUpdateEpisodeStatuses`, `deleteEpisodeStatuses`, `markNextEpisodeWatched`, and their `*Schemas`. Type `DeleteEpisodeStatusesResponse`.

`EpisodeTracker` still fetches `/api/tmdb/episodes/...` directly. That route moves in layer 4.

- [ ] **Step 1: Write the failing test**

Create `src/app/api/status/episodes/route.test.ts`:

```ts
// @vitest-environment node
import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

const batchUpdateEpisodeStatuses = vi.fn();
const deleteEpisodeStatuses = vi.fn();
const listEpisodeStatuses = vi.fn();
const markNextEpisodeWatched = vi.fn();
const updateEpisodeStatus = vi.fn();

vi.mock("@/lib/auth/webauthn", () => ({
  getCurrentUser: vi.fn(async () => ({ id: "user-1" })),
}));

vi.mock("@/lib/episodes/service", () => ({
  batchUpdateEpisodeStatuses: (...args: unknown[]) =>
    batchUpdateEpisodeStatuses(...args),
  deleteEpisodeStatuses: (...args: unknown[]) => deleteEpisodeStatuses(...args),
  listEpisodeStatuses: (...args: unknown[]) => listEpisodeStatuses(...args),
  markNextEpisodeWatched: (...args: unknown[]) =>
    markNextEpisodeWatched(...args),
  updateEpisodeStatus: (...args: unknown[]) => updateEpisodeStatus(...args),
}));

const episodes = await import("./route");
const next = await import("./next/route");

const URL_BASE = "http://localhost/api/status/episodes";
const headers = { cookie: "session=valid" };

function get(search: string) {
  return episodes.GET(new NextRequest(`${URL_BASE}?${search}`, { headers }));
}

function send(method: "POST" | "PUT", body: string) {
  const handler = method === "POST" ? episodes.POST : episodes.PUT;
  return handler(new NextRequest(URL_BASE, { method, headers, body }));
}

const episode = (overrides: Record<string, unknown> = {}) => ({
  seasonNumber: 1,
  episodeNumber: 1,
  watched: true,
  ...overrides,
});

describe("GET and DELETE /api/status/episodes", () => {
  it("passes the filters to the service", async () => {
    listEpisodeStatuses.mockResolvedValue({ episodes: [] });
    const response = await get("tmdbId=1399&seasonNumber=0&episodeNumber=0");
    expect(response.status).toBe(200);
    expect(listEpisodeStatuses).toHaveBeenCalledWith("user-1", 1399, 0, 0);
  });

  it("leaves absent filters undefined", async () => {
    listEpisodeStatuses.mockResolvedValue({ episodes: [] });
    await get("tmdbId=1399");
    expect(listEpisodeStatuses).toHaveBeenCalledWith(
      "user-1",
      1399,
      undefined,
      undefined,
    );
  });

  it.each(["seasonNumber=1", "tmdbId=0", "tmdbId=1399&seasonNumber=-1"])(
    "rejects %s",
    async (search) => {
      const response = await get(search);
      expect(response.status).toBe(400);
      expect(listEpisodeStatuses).not.toHaveBeenCalled();
    },
  );

  it("reports how many statuses were removed", async () => {
    deleteEpisodeStatuses.mockResolvedValue({ deletedCount: 3 });
    const response = await episodes.DELETE(
      new NextRequest(`${URL_BASE}?tmdbId=1399&seasonNumber=2`, {
        method: "DELETE",
        headers,
      }),
    );
    await expect(response.json()).resolves.toEqual({
      message: "Removed 3 episode status(es) successfully",
      deletedCount: 3,
    });
    expect(deleteEpisodeStatuses).toHaveBeenCalledWith(
      "user-1",
      1399,
      2,
      undefined,
    );
  });
});

describe("POST /api/status/episodes", () => {
  it("defaults watched to true and returns 201", async () => {
    updateEpisodeStatus.mockResolvedValue({ episode: {}, newStatus: null });
    const response = await send(
      "POST",
      '{"tmdbId":1399,"seasonNumber":1,"episodeNumber":2}',
    );
    expect(response.status).toBe(201);
    expect(updateEpisodeStatus).toHaveBeenCalledWith("user-1", {
      tmdbId: 1399,
      seasonNumber: 1,
      episodeNumber: 2,
      watched: true,
    });
  });

  it.each([
    ['{"tmdbId":1399,"seasonNumber":1,"episodeNumber":0}'],
    ['{"tmdbId":1399,"seasonNumber":-1,"episodeNumber":1}'],
    ['{"tmdbId":1399,"seasonNumber":1.5,"episodeNumber":1}'],
    ['{"tmdbId":1399,"seasonNumber":"1","episodeNumber":1}'],
    ['{"tmdbId":1399,"seasonNumber":1,"episodeNumber":1,"watched":"no"}'],
    ['{"tmdbId":"1399","seasonNumber":1,"episodeNumber":1}'],
  ])("rejects %s", async (body) => {
    const response = await send("POST", body);
    expect(response.status).toBe(400);
    expect(updateEpisodeStatus).not.toHaveBeenCalled();
  });
});

describe("PUT /api/status/episodes", () => {
  it("accepts an episode numbered 0", async () => {
    batchUpdateEpisodeStatuses.mockResolvedValue({ episodes: [] });
    const response = await send(
      "PUT",
      JSON.stringify({ tmdbId: 1399, episodes: [episode({ episodeNumber: 0 })] }),
    );
    expect(response.status).toBe(200);
    expect(batchUpdateEpisodeStatuses).toHaveBeenCalledWith("user-1", 1399, [
      episode({ episodeNumber: 0 }),
    ]);
  });

  it.each([
    [{ tmdbId: 1399 }, "tmdbId and episodes array are required"],
    [{ tmdbId: 1399, episodes: [] }, "Episodes array cannot be empty"],
    [
      { tmdbId: 1399, episodes: Array.from({ length: 101 }, () => episode()) },
      "Cannot update more than 100 episodes at once",
    ],
    [
      { tmdbId: 1399, episodes: [episode({ watched: "yes" })] },
      "Each episode must have seasonNumber, episodeNumber, and watched properties",
    ],
  ])("rejects %j", async (body, error) => {
    const response = await send("PUT", JSON.stringify(body));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe(error);
    expect(batchUpdateEpisodeStatuses).not.toHaveBeenCalled();
  });
});

describe("POST /api/status/episodes/next", () => {
  const post = (body: string) =>
    next.POST(
      new NextRequest(`${URL_BASE}/next`, { method: "POST", headers, body }),
    );

  it("marks the next episode and returns 201", async () => {
    markNextEpisodeWatched.mockResolvedValue({ episode: {}, newStatus: null });
    const response = await post('{"tmdbId":1399}');
    expect(response.status).toBe(201);
    expect(markNextEpisodeWatched).toHaveBeenCalledWith("user-1", 1399);
  });

  it("rejects a non-numeric id", async () => {
    const response = await post('{"tmdbId":"1399"}');
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe(
      "tmdbId is required and must be a number",
    );
  });

  it.each([
    ["notFound", 404, "TV show not found"],
    ["noNextEpisode", 400, "No next episode available. You're all caught up!"],
    ["notAired", 400, "Next episode hasn't aired yet."],
  ])("maps %s to %i", async (code, status, error) => {
    markNextEpisodeWatched.mockResolvedValue(code);
    const response = await post('{"tmdbId":1399}');
    expect(response.status).toBe(status);
    await expect(response.json()).resolves.toEqual({ error, code });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm exec vitest run src/app/api/status/episodes`
Expected: FAIL. Fractional, string and negative numbers and a string `watched` reach the service, and bodies lack `code`.

- [ ] **Step 3: Write the types, schemas and contract**

Apply to `src/lib/episodes/types.ts`:

```diff
diff --git a/src/lib/episodes/types.ts b/src/lib/episodes/types.ts
index 2efd65d..be058e3 100644
--- a/src/lib/episodes/types.ts
+++ b/src/lib/episodes/types.ts
@@ -52,3 +52,8 @@ export interface MarkNextEpisodeResult {
 }
 
 export type MarkNextEpisodeError = "notFound" | "noNextEpisode" | "notAired";
+
+export interface DeleteEpisodeStatusesResponse {
+  message: string;
+  deletedCount: number;
+}
```

Create `src/lib/episodes/schemas.ts`:

```ts
import { z } from "zod";

import { q } from "../api/query";

const TMDB_ID_INVALID = "tmdbId must be a positive integer";
const EPISODE_NUMBERS_REQUIRED =
  "seasonNumber and episodeNumber must be numbers";
const EPISODE_NUMBERS_INVALID = "Invalid season or episode number";
const EPISODE_ITEM_INVALID =
  "Each episode must have seasonNumber, episodeNumber, and watched properties";

const tmdbId = z.int(TMDB_ID_INVALID).positive(TMDB_ID_INVALID);

// Season 0 holds specials, and some seasons number an episode 0, so the
// filters accept 0 for both.
const episodeQuery = z.object({
  tmdbId: q.int({ min: 1, message: TMDB_ID_INVALID }),
  seasonNumber: q
    .int({ min: 0, message: "seasonNumber must be a whole number" })
    .optional(),
  episodeNumber: q
    .int({ min: 0, message: "episodeNumber must be a whole number" })
    .optional(),
});

export const listEpisodeStatusesSchemas = { query: episodeQuery };

export const updateEpisodeStatusSchemas = {
  body: z.object({
    tmdbId,
    seasonNumber: z
      .int(EPISODE_NUMBERS_REQUIRED)
      .min(0, EPISODE_NUMBERS_INVALID),
    episodeNumber: z
      .int(EPISODE_NUMBERS_REQUIRED)
      .min(1, EPISODE_NUMBERS_INVALID),
    watched: z.boolean().default(true),
  }),
};

export const batchUpdateEpisodeStatusesSchemas = {
  body: z.object({
    tmdbId,
    episodes: z
      .array(
        z.object({
          seasonNumber: z.int(EPISODE_ITEM_INVALID).min(0, EPISODE_ITEM_INVALID),
          episodeNumber: z
            .int(EPISODE_ITEM_INVALID)
            .min(0, EPISODE_ITEM_INVALID),
          watched: z.boolean(EPISODE_ITEM_INVALID),
        }),
        "tmdbId and episodes array are required",
      )
      .min(1, "Episodes array cannot be empty")
      .max(100, "Cannot update more than 100 episodes at once"),
  }),
};

export const deleteEpisodeStatusesSchemas = { query: episodeQuery };

export const markNextEpisodeWatchedSchemas = {
  body: z.object({
    tmdbId: z
      .int("tmdbId is required and must be a number")
      .positive("tmdbId is required and must be a number"),
  }),
};
```

Create `src/lib/episodes/contract.ts`:

```ts
import { defineContract, schemas, type } from "../api/contract";
import type {
  batchUpdateEpisodeStatusesSchemas,
  deleteEpisodeStatusesSchemas,
  listEpisodeStatusesSchemas,
  markNextEpisodeWatchedSchemas,
  updateEpisodeStatusSchemas,
} from "./schemas";
import type {
  BatchUpdateEpisodesResult,
  DeleteEpisodeStatusesResponse,
  ListEpisodeStatusResponse,
  MarkNextEpisodeResult,
  UpdateEpisodeStatusResult,
} from "./types";

export const listEpisodeStatuses = defineContract({
  method: "GET",
  path: "/api/status/episodes",
  label: "Get episode status",
  schemas: schemas<typeof listEpisodeStatusesSchemas>(),
  response: type<ListEpisodeStatusResponse>(),
});

export const updateEpisodeStatus = defineContract({
  method: "POST",
  path: "/api/status/episodes",
  label: "Update episode status",
  status: 201,
  schemas: schemas<typeof updateEpisodeStatusSchemas>(),
  response: type<UpdateEpisodeStatusResult>(),
});

export const batchUpdateEpisodeStatuses = defineContract({
  method: "PUT",
  path: "/api/status/episodes",
  label: "Batch update episode status",
  schemas: schemas<typeof batchUpdateEpisodeStatusesSchemas>(),
  response: type<BatchUpdateEpisodesResult>(),
});

export const deleteEpisodeStatuses = defineContract({
  method: "DELETE",
  path: "/api/status/episodes",
  label: "Delete episode status",
  schemas: schemas<typeof deleteEpisodeStatusesSchemas>(),
  response: type<DeleteEpisodeStatusesResponse>(),
});

export const markNextEpisodeWatched = defineContract({
  method: "POST",
  path: "/api/status/episodes/next",
  label: "Mark next episode as watched",
  status: 201,
  schemas: schemas<typeof markNextEpisodeWatchedSchemas>(),
  response: type<MarkNextEpisodeResult>(),
  errors: {
    notFound: { status: 404, message: "TV show not found" },
    noNextEpisode: {
      status: 400,
      message: "No next episode available. You're all caught up!",
    },
    notAired: { status: 400, message: "Next episode hasn't aired yet." },
  },
});
```

- [ ] **Step 4: Rewrite the routes**

Replace `src/app/api/status/episodes/route.ts` with:

```ts
import { authedRoute } from "@/lib/api/route";
import * as episodesApi from "@/lib/episodes/contract";
import {
  batchUpdateEpisodeStatusesSchemas,
  deleteEpisodeStatusesSchemas,
  listEpisodeStatusesSchemas,
  updateEpisodeStatusSchemas,
} from "@/lib/episodes/schemas";
import {
  batchUpdateEpisodeStatuses,
  deleteEpisodeStatuses,
  listEpisodeStatuses,
  updateEpisodeStatus,
} from "@/lib/episodes/service";

// GET /api/status/episodes - Get episode watch status for authenticated user
export const GET = authedRoute(
  episodesApi.listEpisodeStatuses,
  listEpisodeStatusesSchemas,
  ({ user, query }) =>
    listEpisodeStatuses(
      user.id,
      query.tmdbId,
      query.seasonNumber,
      query.episodeNumber,
    ),
);

// POST /api/status/episodes - Mark episode as watched/unwatched
export const POST = authedRoute(
  episodesApi.updateEpisodeStatus,
  updateEpisodeStatusSchemas,
  ({ user, body }) => updateEpisodeStatus(user.id, body),
);

// PUT /api/status/episodes - Batch update multiple episodes
export const PUT = authedRoute(
  episodesApi.batchUpdateEpisodeStatuses,
  batchUpdateEpisodeStatusesSchemas,
  ({ user, body }) =>
    batchUpdateEpisodeStatuses(user.id, body.tmdbId, body.episodes),
);

// DELETE /api/status/episodes - Remove episode watch status
export const DELETE = authedRoute(
  episodesApi.deleteEpisodeStatuses,
  deleteEpisodeStatusesSchemas,
  async ({ user, query }) => {
    const { deletedCount } = await deleteEpisodeStatuses(
      user.id,
      query.tmdbId,
      query.seasonNumber,
      query.episodeNumber,
    );
    return {
      message: `Removed ${deletedCount} episode status(es) successfully`,
      deletedCount,
    };
  },
);
```

Replace `src/app/api/status/episodes/next/route.ts` with:

```ts
import { authedRoute } from "@/lib/api/route";
import * as episodesApi from "@/lib/episodes/contract";
import { markNextEpisodeWatchedSchemas } from "@/lib/episodes/schemas";
import { markNextEpisodeWatched } from "@/lib/episodes/service";

// POST /api/status/episodes/next - Mark the next available episode as watched
export const POST = authedRoute(
  episodesApi.markNextEpisodeWatched,
  markNextEpisodeWatchedSchemas,
  ({ user, body }) => markNextEpisodeWatched(user.id, body.tmdbId),
);
```

- [ ] **Step 5: Update the callers**

Apply to `src/components/content/ContentCard.tsx`:

```diff
diff --git a/src/components/content/ContentCard.tsx b/src/components/content/ContentCard.tsx
index 9d5ee89..9f9a71c 100644
--- a/src/components/content/ContentCard.tsx
+++ b/src/components/content/ContentCard.tsx
@@ -8,6 +8,7 @@ import { forwardRef, useEffect, useRef, useState } from "react";
 import { api } from "@/lib/api/client";
 import * as contentStatusApi from "@/lib/content-status/contract";
 import type { WatchStatusEnum } from "@/lib/db/schema";
+import * as episodesApi from "@/lib/episodes/contract";
 import { getImageUrl } from "@/lib/tmdb/client";
 import { cn, formatVoteAverage } from "@/lib/utils";
 
@@ -74,19 +75,10 @@ const ContentCard = forwardRef<HTMLDivElement, ContentCardProps>(
     });
 
     const completeNextEpisodeMutation = useMutation({
-      mutationFn: async (): Promise<MarkNextEpisodeResult> => {
-        const response = await fetch("/api/status/episodes/next", {
-          method: "POST",
-          headers: { "Content-Type": "application/json" },
-          body: JSON.stringify({ tmdbId: content.tmdbId }),
-        });
-        const data = await response.json();
-        if (!response.ok)
-          throw new Error(
-            data.error || "Failed to mark next episode as watched",
-          );
-        return data;
-      },
+      mutationFn: () =>
+        api(episodesApi.markNextEpisodeWatched, {
+          body: { tmdbId: content.tmdbId },
+        }),
       onSuccess: (result) => {
         if (result.newStatus)
           setWatchStatus(result.newStatus as WatchStatusEnum);
@@ -301,4 +293,3 @@ ContentCard.displayName = "ContentCard";
 
 export { ContentCard };
 import type { TMDBContent } from "@/lib/content-status/types";
-import type { MarkNextEpisodeResult } from "@/lib/episodes/types";
```

Apply to `src/components/content/EpisodeTracker.tsx`:

```diff
diff --git a/src/components/content/EpisodeTracker.tsx b/src/components/content/EpisodeTracker.tsx
index bf38552..4c6f257 100644
--- a/src/components/content/EpisodeTracker.tsx
+++ b/src/components/content/EpisodeTracker.tsx
@@ -12,12 +12,10 @@ import {
 } from "lucide-react";
 import { useState } from "react";
 
+import { api } from "@/lib/api/client";
 import { WatchStatusEnum } from "@/lib/db";
-import type {
-  BatchUpdateEpisodesResult,
-  EpisodeStatusItem,
-  UpdateEpisodeStatusResult,
-} from "@/lib/episodes/types";
+import * as episodesApi from "@/lib/episodes/contract";
+import type { EpisodeStatusItem } from "@/lib/episodes/types";
 import type { TMDBSeason, TMDBTVShowDetails } from "@/lib/tmdb/client";
 import { cn } from "@/lib/utils";
 
@@ -63,12 +61,10 @@ export function EpisodeTracker({
   const seasonsQuery = useQuery<SeasonData[]>({
     queryKey: ["episodes", tvShowId],
     queryFn: async () => {
-      const statusResponse = await fetch(
-        `/api/status/episodes?tmdbId=${tvShowId}`,
+      const { episodes: watchStatuses } = await api(
+        episodesApi.listEpisodeStatuses,
+        { query: { tmdbId: tvShowId } },
       );
-      if (!statusResponse.ok)
-        throw new Error("Failed to fetch episode watch statuses");
-      const { episodes: watchStatuses } = await statusResponse.json();
 
       const seasonPromises: Array<
         Promise<{ seasonNumber: number; season: TMDBSeason }>
@@ -114,20 +110,10 @@ export function EpisodeTracker({
       seasonNumber: number;
       episodeNumber: number;
       watched: boolean;
-    }): Promise<UpdateEpisodeStatusResult> => {
-      const response = await fetch("/api/status/episodes", {
-        method: "POST",
-        headers: { "Content-Type": "application/json" },
-        body: JSON.stringify({
-          tmdbId: tvShowId,
-          seasonNumber,
-          episodeNumber,
-          watched,
-        }),
-      });
-      if (!response.ok) throw new Error("Failed to update episode status");
-      return response.json();
-    },
+    }) =>
+      api(episodesApi.updateEpisodeStatus, {
+        body: { tmdbId: tvShowId, seasonNumber, episodeNumber, watched },
+      }),
     onSuccess: ({ newStatus }, variables) => {
       if (newStatus) onShowStatusChanged?.(newStatus as WatchStatusEnum);
       queryClient.setQueryData<SeasonData[]>(["episodes", tvShowId], (prev) => {
@@ -214,15 +200,10 @@ export function EpisodeTracker({
         episodeNumber: number;
         watched: boolean;
       }>;
-    }): Promise<BatchUpdateEpisodesResult> => {
-      const response = await fetch("/api/status/episodes", {
-        method: "PUT",
-        headers: { "Content-Type": "application/json" },
-        body: JSON.stringify({ tmdbId: tvShowId, episodes: payload.episodes }),
-      });
-      if (!response.ok) throw new Error("Failed to update season status");
-      return response.json();
-    },
+    }) =>
+      api(episodesApi.batchUpdateEpisodeStatuses, {
+        body: { tmdbId: tvShowId, episodes: payload.episodes },
+      }),
     onSuccess: () => {
       queryClient.invalidateQueries({ queryKey: ["episodes", tvShowId] });
     },
```

Apply to `src/components/activity/UpcomingActivityCard.tsx`:

```diff
diff --git a/src/components/activity/UpcomingActivityCard.tsx b/src/components/activity/UpcomingActivityCard.tsx
index d780a1b..c09cb99 100644
--- a/src/components/activity/UpcomingActivityCard.tsx
+++ b/src/components/activity/UpcomingActivityCard.tsx
@@ -8,7 +8,8 @@ import { useState } from "react";
 import { Button } from "@/components/ui/Button";
 import { Card, CardContent } from "@/components/ui/Card";
 import type { UpcomingActivity } from "@/lib/activity/types";
-import type { MarkNextEpisodeResult } from "@/lib/episodes/types";
+import { api, errorMessage } from "@/lib/api/client";
+import * as episodesApi from "@/lib/episodes/contract";
 import { getImageUrl } from "@/lib/tmdb/client";
 
 import { ContentDetailsModal } from "../content/ContentDetailsModal";
@@ -23,36 +24,24 @@ export function UpcomingActivityCard({
   upcoming,
   onEpisodeWatched,
 }: UpcomingActivityCardProps) {
-  const [isWatching, setIsWatching] = useState(false);
   const [isModalOpen, setIsModalOpen] = useState(false);
   const [error, setError] = useState("");
 
   const markWatchedMutation = useMutation({
-    mutationFn: async (): Promise<MarkNextEpisodeResult> => {
-      const response = await fetch("/api/status/episodes/next", {
-        method: "POST",
-        headers: { "Content-Type": "application/json" },
-        body: JSON.stringify({ tmdbId: upcoming.tmdbId }),
-      });
-      const data = await response.json();
-      if (!response.ok)
-        throw new Error(data.error || "Failed to mark episode as watched");
-      return data;
-    },
+    mutationFn: () =>
+      api(episodesApi.markNextEpisodeWatched, {
+        body: { tmdbId: upcoming.tmdbId },
+      }),
     onSuccess: () => {
       setError("");
       onEpisodeWatched?.();
     },
     onError: (err: unknown) => {
-      setError(
-        err instanceof Error ? err.message : "Failed to mark episode as watched",
-      );
+      setError(errorMessage(err, "Failed to mark episode as watched"));
     },
-    onSettled: () => setIsWatching(false),
   });
 
   const handleMarkWatched = async () => {
-    setIsWatching(true);
     setError("");
     try {
       await markWatchedMutation.mutateAsync();
@@ -102,7 +91,10 @@ export function UpcomingActivityCard({
                 {upcoming.title}
               </h3>
               <div>
-                <Button onClick={handleMarkWatched} loading={isWatching}>
+                <Button
+                  onClick={handleMarkWatched}
+                  loading={markWatchedMutation.isPending}
+                >
                   <>
                     <Play className="h-5 w-5 mr-2" />
                     <span>Episode Watched</span>
```

- [ ] **Step 6: Run the tests and typecheck**

Run: `pnpm exec vitest run src/app/api/status src/components src/lib/episodes src/lib/api && pnpm typecheck`
Expected: all PASS, no type errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/episodes src/app/api/status/episodes src/components/content/ContentCard.tsx src/components/content/EpisodeTracker.tsx src/components/activity/UpcomingActivityCard.tsx
git commit -m "refactor: move episode status onto typed contracts"
```

---

### Task 4: API docs and final checks

**Files:**
- Modify: `docs/api/openapi.yaml`

**Interfaces:**
- Consumes: everything above. Produces nothing later tasks use.

- [ ] **Step 1: Update the API docs**

This adds the integer bounds the schemas now enforce. Apply to `docs/api/openapi.yaml`:

```diff
diff --git a/docs/api/openapi.yaml b/docs/api/openapi.yaml
index 5631ecd..9a80665 100644
--- a/docs/api/openapi.yaml
+++ b/docs/api/openapi.yaml
@@ -454,6 +454,7 @@ components:
           properties:
             tmdbId:
               type: integer
+              minimum: 1
             contentType:
               const: movie
             status:
@@ -464,6 +465,7 @@ components:
           properties:
             tmdbId:
               type: integer
+              minimum: 1
             contentType:
               const: tv
             status:
@@ -476,6 +478,7 @@ components:
           properties:
             tmdbId:
               type: integer
+              minimum: 1
             contentType:
               const: movie
             status:
@@ -486,6 +489,7 @@ components:
           properties:
             tmdbId:
               type: integer
+              minimum: 1
             contentType:
               const: tv
             status:
@@ -528,12 +532,16 @@ components:
       properties:
         tmdbId:
           type: integer
+          minimum: 1
         seasonNumber:
           type: integer
+          minimum: 0
         episodeNumber:
           type: integer
+          minimum: 1
         watched:
           type: boolean
+          default: true
     UpdateEpisodeStatusResponse:
       type: object
       required: [episode, newStatus]
@@ -548,16 +556,21 @@ components:
       properties:
         tmdbId:
           type: integer
+          minimum: 1
         episodes:
           type: array
+          minItems: 1
+          maxItems: 100
           items:
             type: object
             required: [seasonNumber, episodeNumber, watched]
             properties:
               seasonNumber:
                 type: integer
+                minimum: 0
               episodeNumber:
                 type: integer
+                minimum: 0
               watched:
                 type: boolean
     BatchUpdateEpisodesResponse:
@@ -580,6 +593,7 @@ components:
       properties:
         tmdbId:
           type: integer
+          minimum: 1
     MarkNextEpisodeResponse:
       type: object
       required: [episode, newStatus, episodeDetails]
@@ -2045,6 +2059,7 @@ paths:
           required: true
           schema:
             type: integer
+            minimum: 1
         - in: query
           name: contentType
           required: true
@@ -2170,6 +2185,7 @@ paths:
           required: true
           schema:
             type: integer
+            minimum: 1
         - in: query
           name: contentType
           required: true
@@ -2218,16 +2234,19 @@ paths:
           required: true
           schema:
             type: integer
+            minimum: 1
         - in: query
           name: seasonNumber
           required: false
           schema:
             type: integer
+            minimum: 0
         - in: query
           name: episodeNumber
           required: false
           schema:
             type: integer
+            minimum: 0
       responses:
         "200":
           description: Episode statuses
@@ -2336,16 +2355,19 @@ paths:
           required: true
           schema:
             type: integer
+            minimum: 1
         - in: query
           name: seasonNumber
           required: false
           schema:
             type: integer
+            minimum: 0
         - in: query
           name: episodeNumber
           required: false
           schema:
             type: integer
+            minimum: 0
       responses:
         "200":
           description: Deleted count
```

- [ ] **Step 2: Confirm no hand parsing remains in these routes**

Run: `grep -rnE 'parseInt|searchParams|request\.json' src/app/api/status --include=route.ts`
Expected: no output.

- [ ] **Step 3: Run every CI gate**

Use `pnpm lint:ci`, never `pnpm lint`, which auto-fixes files.

```bash
pnpm lint:ci
pnpm test:coverage
rm -rf .next && DATABASE_URL=postgresql://ci:ci@localhost:5432/ci pnpm build
pnpm typecheck
```

Expected: all pass, with coverage above the floors in `vitest.config.mts`. On the prototype, the suite had 1,621 passing tests. Report any failure with its output.

- [ ] **Step 4: Check the bundle**

Run this in a POSIX shell, using `bash -c` if your shell is fish:

```bash
find .next/static/chunks -name '*.js' | xargs -I{} sh -c 'gzip -c "{}" | wc -c' | awk '{s+=$1} END {print "gz:", s, "delta:", s-507379}'
grep -lE 'invalid_union|ZodError|\$ZodType' .next/static/chunks/*.js | wc -l
```

Expected: delta about 2,800 and well under 10,000; `0` chunks containing Zod. If a command is blocked, report it rather than finding another way to run it.

- [ ] **Step 5: Commit**

```bash
git add docs/api/openapi.yaml
git commit -m "docs: document integer bounds on the status routes"
```
